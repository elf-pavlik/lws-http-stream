use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use golem_rust::agentic::{
    AgentStream, Config, Header, HttpRequest, HttpResponse, HttpRouter, spawn_local,
};
use golem_rust::http_router;
use json_ld::{
    LoadError, Loader, RemoteDocument,
    iref::{Iri, IriBuf},
    syntax::{Parse, Value as JsonLdValue},
};
use serde_json::{Map, Value as Json, json};

const NDJSON_MEDIA_TYPE: &str = "application/x-ndjson";
const CBOR_SEQ_MEDIA_TYPE: &str = "application/cbor-seq";
const JELLY_MEDIA_TYPE: &str = "application/x-jelly-rdf";
const DEFAULT_INTERVAL_MS: u64 = 250;
const MAX_COUNT: u64 = 100;
const MAX_INTERVAL_MS: u64 = 5_000;
const LWS_CONTEXT_PATH: &str = "/contexts/lws-notifications-v1.jsonld";
const JSON_LD_CONTEXT_REL: &str = "http://www.w3.org/ns/json-ld#context";

fn notifications() -> &'static [Json] {
    static NOTIFICATIONS: OnceLock<Vec<Json>> = OnceLock::new();
    NOTIFICATIONS
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../fixtures/notifications.json"))
                .expect("fixture notifications must be valid JSON")
        })
        .as_slice()
}

fn lws_context() -> &'static Json {
    static CONTEXT: OnceLock<Json> = OnceLock::new();
    CONTEXT.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../fixtures/contexts/lws-notifications-v1.json"
        ))
        .expect("LWS context fixture must be valid JSON")
    })
}

fn inline_notification(notification: &Json) -> Json {
    let mut object = Map::new();
    object.insert("@context".to_string(), lws_context()["@context"].clone());
    if let Json::Object(entries) = notification {
        for (key, value) in entries {
            object.insert(key.clone(), value.clone());
        }
    }
    Json::Object(object)
}

fn encode_ndjson(notification: &Json, inline_context: bool) -> Vec<u8> {
    let payload = if inline_context {
        inline_notification(notification)
    } else {
        notification.clone()
    };
    let mut line = serde_json::to_vec(&payload).expect("serialize NDJSON notification");
    line.push(b'\n');
    line
}

fn encode_plain_cbor(notification: &Json) -> Vec<u8> {
    let mut bytes = Vec::new();
    ciborium::into_writer(notification, &mut bytes).expect("encode plain CBOR notification");
    bytes
}

async fn encode_cbor_ld(
    notification: &Json,
    loader: &EmbeddedContextLoader,
) -> Result<Vec<u8>, cbor_ld::EncodeError> {
    let payload = inline_notification(notification);
    let source = serde_json::to_string(&payload).expect("serialize JSON-LD notification");
    let json_ld_document: JsonLdValue = source
        .parse()
        .expect("parse JSON-LD notification for CBOR-LD");
    cbor_ld::encode_to_bytes(&json_ld_document, loader).await
}

/// Context documents are embedded from the same cache the Node server uses.
/// No network access or agent filesystem is involved in CBOR-LD compression.
struct EmbeddedContextLoader {
    documents: HashMap<String, JsonLdValue>,
}

impl EmbeddedContextLoader {
    fn new() -> Self {
        let cached: HashMap<String, Json> =
            serde_json::from_str(include_str!("../../fixtures/contexts/cached-context.json"))
                .expect("cached context fixture must be valid JSON");

        let documents = cached
            .into_iter()
            .map(|(url, document)| {
                let source = serde_json::to_string(&document).expect("serialize cached context");
                let value = JsonLdValue::parse_str(&source)
                    .expect("parse cached context as JSON-LD")
                    .0;
                (url, value)
            })
            .collect();

        Self { documents }
    }
}

impl Loader for EmbeddedContextLoader {
    async fn load(&self, url: &Iri) -> Result<RemoteDocument<IriBuf>, LoadError> {
        match self.documents.get(url.as_str()) {
            Some(document) => Ok(RemoteDocument::new(
                Some(url.to_owned()),
                Some(
                    "application/ld+json"
                        .parse()
                        .expect("application/ld+json is a valid MIME type"),
                ),
                document.clone(),
            )),
            None => Err(LoadError::new(
                url.to_owned(),
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("no embedded context document for {url}"),
                ),
            )),
        }
    }
}

enum ContextMode {
    Link,
    Inline,
}

impl ContextMode {
    fn is_inline(&self) -> bool {
        matches!(self, Self::Inline)
    }
}

enum Representation {
    Ndjson,
    CborSeq,
    Jelly,
    Unknown,
}

struct MediaRange {
    media_type: String,
    subtype: String,
    q: f64,
}

fn parse_accept(header: &str) -> Vec<MediaRange> {
    header
        .split(',')
        .filter_map(|part| {
            let mut parameters = part.split(';');
            let media = parameters.next()?.trim().to_ascii_lowercase();
            let (media_type, subtype) = media.split_once('/')?;
            let q = parameters
                .find_map(|parameter| {
                    let (key, value) = parameter.trim().split_once('=')?;
                    key.eq_ignore_ascii_case("q")
                        .then(|| value.trim().parse::<f64>().unwrap_or(0.0))
                })
                .unwrap_or(1.0);
            Some(MediaRange {
                media_type: media_type.to_string(),
                subtype: subtype.to_string(),
                q: if q.is_finite() { q.max(0.0) } else { 0.0 },
            })
        })
        .filter(|range| !range.media_type.is_empty())
        .collect()
}

fn quality_for(ranges: &[MediaRange], media_type: &str, subtype: &str) -> f64 {
    let mut best_specificity = -1;
    let mut quality = 0.0;

    for range in ranges {
        let specificity = if range.media_type == media_type && range.subtype == subtype {
            2
        } else if range.media_type == media_type && range.subtype == "*" {
            1
        } else if range.media_type == "*" && range.subtype == "*" {
            0
        } else {
            -1
        };

        if specificity > best_specificity {
            best_specificity = specificity;
            quality = range.q;
        } else if specificity == best_specificity && specificity >= 0 {
            quality = quality.max(range.q);
        }
    }

    quality
}

fn requested_representation(accept_header: Option<&str>) -> Representation {
    let header = accept_header.unwrap_or("");
    let ranges = parse_accept(header);

    if ranges.is_empty() {
        return if header.trim().is_empty() {
            Representation::Ndjson
        } else {
            Representation::Unknown
        };
    }

    let ndjson = quality_for(&ranges, "application", "x-ndjson");
    let cbor_sequence = quality_for(&ranges, "application", "cbor-seq");
    let jelly = quality_for(&ranges, "application", "x-jelly-rdf");

    if ndjson == 0.0 && cbor_sequence == 0.0 && jelly == 0.0 {
        return Representation::Unknown;
    }
    if ndjson >= cbor_sequence && ndjson >= jelly {
        Representation::Ndjson
    } else if cbor_sequence >= jelly {
        Representation::CborSeq
    } else {
        Representation::Jelly
    }
}

fn accept_header(request: &HttpRequest) -> Option<String> {
    let values: Vec<String> = request
        .headers
        .iter()
        .filter(|header| header.name.eq_ignore_ascii_case("accept"))
        .map(|header| String::from_utf8_lossy(&header.value).into_owned())
        .collect();

    if values.is_empty() {
        None
    } else {
        Some(values.join(", "))
    }
}

fn query_param<'a>(request: &'a HttpRequest, name: &str) -> Option<&'a str> {
    request.query.as_deref()?.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        (key == name).then_some(value)
    })
}

fn parse_integer(raw: Option<&str>, fallback: u64, minimum: u64, maximum: u64) -> Option<u64> {
    let Some(raw) = raw else {
        return Some(fallback);
    };
    if raw.is_empty() || !raw.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    let value = raw.parse::<u64>().ok()?;
    (value >= minimum && value <= maximum).then_some(value)
}

fn parse_optional_integer(
    raw: Option<&str>,
    minimum: u64,
    maximum: u64,
) -> Result<Option<u64>, ()> {
    match raw {
        None => Ok(None),
        Some(value) => parse_integer(Some(value), minimum, minimum, maximum)
            .map(Some)
            .ok_or(()),
    }
}

fn parse_context_mode(raw: Option<&str>) -> Option<ContextMode> {
    match raw.unwrap_or("link") {
        "link" => Some(ContextMode::Link),
        "inline" => Some(ContextMode::Inline),
        _ => None,
    }
}

fn header(name: &str, value: &str) -> Header {
    Header {
        name: name.to_string(),
        value: value.as_bytes().to_vec(),
    }
}

fn chunk_stream(bytes: Vec<u8>) -> AgentStream<Vec<u8>> {
    let (mut writer, stream) = AgentStream::new();
    spawn_local(async move {
        let _ = writer.write_one(bytes).await;
    });
    stream
}

fn json_response(status: u16, body: Json) -> HttpResponse {
    let bytes = serde_json::to_vec(&body).expect("serialize JSON response");
    HttpResponse {
        status,
        headers: vec![
            header("content-type", "application/json"),
            header("cache-control", "no-store"),
            header("vary", "Accept"),
        ],
        body: chunk_stream(bytes),
    }
}

fn invalid_query(parameter: &str, minimum: u64, maximum: u64) -> HttpResponse {
    json_response(
        400,
        json!({
            "error": "invalid_query",
            "parameter": parameter,
            "message": format!("\"{parameter}\" must be an integer between {minimum} and {maximum}."),
            "minimum": minimum,
            "maximum": maximum,
        }),
    )
}

fn invalid_context_mode() -> HttpResponse {
    json_response(
        400,
        json!({
            "error": "invalid_query",
            "parameter": "context",
            "message": "\"context\" must be \"link\" or \"inline\".",
            "allowed": ["link", "inline"],
        }),
    )
}

fn unsupported_representation(representation: &str) -> HttpResponse {
    json_response(
        404,
        json!({
            "error": "not_implemented",
            "representation": representation,
            "message": "This Golem build serves NDJSON and CBOR Sequence; Jelly-RDF is not implemented yet.",
            "supported": [NDJSON_MEDIA_TYPE, CBOR_SEQ_MEDIA_TYPE],
        }),
    )
}

fn not_found() -> HttpResponse {
    json_response(
        404,
        json!({
            "error": "not_found",
            "supported": [NDJSON_MEDIA_TYPE, CBOR_SEQ_MEDIA_TYPE],
        }),
    )
}

fn context_link(request: &HttpRequest) -> String {
    let target = format!(
        "{}://{}{}",
        request.scheme, request.authority, LWS_CONTEXT_PATH
    );
    format!("<{target}>; rel=\"{JSON_LD_CONTEXT_REL}\"; type=\"application/ld+json\"")
}

async fn sleep_ms(milliseconds: u64) {
    golem_rust::wasip3::clocks::monotonic_clock::wait_for(milliseconds.saturating_mul(1_000_000))
        .await;
}

enum StreamMode {
    Ndjson { inline_context: bool },
    CborPlain,
    CborLd,
}

fn notification_stream(
    mode: StreamMode,
    interval_ms: u64,
    count: Option<u64>,
    loader: Arc<EmbeddedContextLoader>,
) -> AgentStream<Vec<u8>> {
    let (mut writer, stream) = AgentStream::new();
    let notifications = notifications();

    spawn_local(async move {
        let mut index: u64 = 0;

        loop {
            if count.is_some_and(|limit| index >= limit) {
                break;
            }

            let notification = &notifications[(index as usize) % notifications.len()];
            let bytes = match &mode {
                StreamMode::Ndjson { inline_context } => {
                    encode_ndjson(notification, *inline_context)
                }
                StreamMode::CborPlain => encode_plain_cbor(notification),
                StreamMode::CborLd => match encode_cbor_ld(notification, loader.as_ref()).await {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        log::error!("CBOR-LD encoding failed: {error}");
                        break;
                    }
                },
            };

            if writer.write_one(bytes).await.is_err() {
                break;
            }

            index += 1;
            if count.is_some_and(|limit| index >= limit) {
                break;
            }
            sleep_ms(interval_ms).await;
        }
    });

    stream
}

fn notifications_response(
    request: &HttpRequest,
    loader: Arc<EmbeddedContextLoader>,
) -> HttpResponse {
    let representation = requested_representation(accept_header(request).as_deref());

    if matches!(representation, Representation::Jelly) {
        return unsupported_representation("jelly");
    }
    if matches!(representation, Representation::Unknown) {
        return not_found();
    }

    let count = match parse_optional_integer(query_param(request, "count"), 1, MAX_COUNT) {
        Ok(count) => count,
        Err(()) => return invalid_query("count", 1, MAX_COUNT),
    };
    let interval_ms = match parse_integer(
        query_param(request, "interval"),
        DEFAULT_INTERVAL_MS,
        0,
        MAX_INTERVAL_MS,
    ) {
        Some(interval_ms) => interval_ms,
        None => return invalid_query("interval", 0, MAX_INTERVAL_MS),
    };
    let context_mode = match parse_context_mode(query_param(request, "context")) {
        Some(context_mode) => context_mode,
        None => return invalid_context_mode(),
    };

    let (content_type, mode) = match representation {
        Representation::Ndjson => (
            NDJSON_MEDIA_TYPE,
            StreamMode::Ndjson {
                inline_context: context_mode.is_inline(),
            },
        ),
        Representation::CborSeq => (
            CBOR_SEQ_MEDIA_TYPE,
            if context_mode.is_inline() {
                StreamMode::CborLd
            } else {
                StreamMode::CborPlain
            },
        ),
        Representation::Jelly | Representation::Unknown => unreachable!(),
    };

    let mut headers = vec![
        header("content-type", content_type),
        header("cache-control", "no-store"),
        header("vary", "Accept"),
        header("x-content-type-options", "nosniff"),
        header("access-control-expose-headers", "Link"),
    ];
    if !context_mode.is_inline() {
        headers.push(header("link", &context_link(request)));
    }

    HttpResponse {
        status: 200,
        headers,
        body: notification_stream(mode, interval_ms, count, loader),
    }
}

fn health_response() -> HttpResponse {
    json_response(
        200,
        json!({
            "status": "ok",
            "service": "lws-stream-golem-rust",
            "representations": ["ndjson", "cbor-seq"],
            "mediaTypes": [NDJSON_MEDIA_TYPE, CBOR_SEQ_MEDIA_TYPE],
            "unsupportedMediaTypes": [JELLY_MEDIA_TYPE],
            "defaultRepresentation": "ndjson",
            "contextModes": ["link", "inline"],
            "defaultContextMode": "link",
            "cborLd": true,
        }),
    )
}

fn context_response() -> HttpResponse {
    HttpResponse {
        status: 200,
        headers: vec![
            header("content-type", "application/ld+json; charset=utf-8"),
            header("cache-control", "public, max-age=3600"),
            header("x-content-type-options", "nosniff"),
        ],
        body: chunk_stream(
            include_str!("../../fixtures/contexts/lws-notifications-v1.json")
                .as_bytes()
                .to_vec(),
        ),
    }
}

pub struct LwsRouter {
    loader: Arc<EmbeddedContextLoader>,
}

#[http_router(name = "LwsRouter", mount = "/", cors = ["*"])]
impl HttpRouter for LwsRouter {
    type Config = ();

    fn new(_: Config<()>) -> Self {
        Self {
            loader: Arc::new(EmbeddedContextLoader::new()),
        }
    }

    async fn handle(&self, request: HttpRequest) -> HttpResponse {
        match request.path.as_str() {
            "/notifications" => notifications_response(&request, self.loader.clone()),
            "/health" => health_response(),
            LWS_CONTEXT_PATH => context_response(),
            _ => not_found(),
        }
    }
}
