use std::collections::HashMap;

use prost::Message as _;
use serde_json::Value as Json;

use crate::proto::{
    LogicalStreamType, PhysicalStreamType, RdfDatatypeEntry, RdfDefaultGraph, RdfIri, RdfLiteral,
    RdfNameEntry, RdfQuad, RdfStreamFrame, RdfStreamOptions, RdfStreamRow,
    rdf_literal::LiteralKind, rdf_quad, rdf_stream_row::Row,
};

const LWS: &str = "https://www.w3.org/ns/lws#";
const AS: &str = "https://www.w3.org/ns/activitystreams#";
const RDF_TYPE: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_DATE_TIME: &str = "http://www.w3.org/2001/XMLSchema#dateTime";

const MAX_NAME_TABLE_SIZE: u32 = 4_000;
const MAX_DATATYPE_TABLE_SIZE: u32 = 32;

enum JellyObject {
    Iri(String),
    Literal { lex: String, datatype: String },
}

struct PlainQuad {
    subject: String,
    predicate: String,
    object: JellyObject,
}

fn iri(subject: &str, predicate: &str, object: &str) -> PlainQuad {
    PlainQuad {
        subject: subject.to_string(),
        predicate: predicate.to_string(),
        object: JellyObject::Iri(object.to_string()),
    }
}

fn typed_literal(subject: &str, predicate: &str, lex: &str, datatype: &str) -> PlainQuad {
    PlainQuad {
        subject: subject.to_string(),
        predicate: predicate.to_string(),
        object: JellyObject::Literal {
            lex: lex.to_string(),
            datatype: datatype.to_string(),
        },
    }
}

fn required_str<'a>(value: &'a Json, field: &str) -> &'a str {
    value
        .get(field)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("Jelly notification is missing string field {field}"))
}

fn type_names<'a>(value: &'a Json, field: &str) -> Vec<&'a str> {
    value
        .get(field)
        .and_then(Json::as_array)
        .map(|items| items.iter().filter_map(Json::as_str).collect())
        .unwrap_or_default()
}

/// Reverse of the client's `quadsToNotification` reconstruction. Keep this in
/// sync with `packages/server/src/jelly.ts`.
fn notification_to_quads(notification: &Json) -> Vec<PlainQuad> {
    let id = required_str(notification, "id");
    let storage = required_str(notification, "storage");
    let mut quads = vec![
        iri(id, RDF_TYPE, &format!("{LWS}Notification")),
        iri(id, &format!("{LWS}storage"), storage),
    ];

    let activity_value = &notification["activity"];
    let activities: Vec<&Json> = match activity_value {
        Json::Array(items) => items.iter().collect(),
        other => vec![other],
    };

    for activity in activities {
        let activity_id = required_str(activity, "id");
        quads.push(iri(id, &format!("{LWS}activity"), activity_id));

        for type_name in type_names(activity, "type") {
            quads.push(iri(activity_id, RDF_TYPE, &format!("{AS}{type_name}")));
        }

        if let Some(actor) = activity.get("actor").and_then(Json::as_str) {
            quads.push(iri(activity_id, &format!("{AS}actor"), actor));
        }

        let object = &activity["object"];
        let object_id = required_str(object, "id");
        quads.push(iri(activity_id, &format!("{AS}object"), object_id));
        for type_name in type_names(object, "type") {
            quads.push(iri(object_id, RDF_TYPE, &format!("{LWS}{type_name}")));
        }

        if let Some(target) = activity.get("target").and_then(Json::as_str) {
            quads.push(iri(activity_id, &format!("{AS}target"), target));
        }
        if let Some(origin) = activity.get("origin").and_then(Json::as_str) {
            quads.push(iri(activity_id, &format!("{AS}origin"), origin));
        }

        let published = required_str(activity, "published");
        quads.push(typed_literal(
            activity_id,
            &format!("{AS}published"),
            published,
            XSD_DATE_TIME,
        ));
    }

    quads
}

enum PreparedObject {
    Iri(u32),
    Literal { lex: String, datatype: u32 },
}

struct PreparedQuad {
    subject: u32,
    predicate: u32,
    object: PreparedObject,
}

/// Row-layout Jelly-RDF 1.1 encoder. `jelly_rs` currently implements the
/// decoder only, so this writer uses the same Jelly-RDF protobuf schema and
/// emits protocol version 2 frames understood by `rdfjs-jelly`.
pub struct JellyNotificationEncoder {
    names: HashMap<String, u32>,
    next_name_id: u32,
    datatypes: HashMap<String, u32>,
    next_datatype_id: u32,
    first_frame: bool,
}

impl JellyNotificationEncoder {
    pub fn new() -> Self {
        Self {
            names: HashMap::new(),
            next_name_id: 1,
            datatypes: HashMap::new(),
            next_datatype_id: 1,
            first_frame: true,
        }
    }

    pub fn add_notification(&mut self, notification: &Json) -> Vec<u8> {
        let quads = notification_to_quads(notification);
        let mut lookup_rows = Vec::new();
        let mut prepared = Vec::with_capacity(quads.len());

        for quad in &quads {
            let subject = self.ensure_name(&quad.subject, &mut lookup_rows);
            let predicate = self.ensure_name(&quad.predicate, &mut lookup_rows);
            let object = match &quad.object {
                JellyObject::Iri(value) => {
                    PreparedObject::Iri(self.ensure_name(value, &mut lookup_rows))
                }
                JellyObject::Literal { lex, datatype } => PreparedObject::Literal {
                    lex: lex.clone(),
                    datatype: self.ensure_datatype(datatype, &mut lookup_rows),
                },
            };
            prepared.push(PreparedQuad {
                subject,
                predicate,
                object,
            });
        }

        let mut rows = Vec::new();
        if std::mem::take(&mut self.first_frame) {
            rows.push(RdfStreamRow {
                row: Some(Row::Options(stream_options())),
            });
        }
        rows.extend(lookup_rows);
        for quad in prepared {
            rows.push(RdfStreamRow {
                row: Some(Row::Quad(encode_quad(&quad))),
            });
        }

        let frame = RdfStreamFrame {
            rows,
            columns: None,
            metadata: Default::default(),
        };
        let mut bytes = Vec::new();
        frame
            .encode_length_delimited(&mut bytes)
            .expect("encode Jelly stream frame");
        bytes
    }

    fn ensure_name(&mut self, value: &str, rows: &mut Vec<RdfStreamRow>) -> u32 {
        if let Some(id) = self.names.get(value) {
            return *id;
        }

        let id = self.next_name_id;
        assert!(
            id <= MAX_NAME_TABLE_SIZE,
            "Jelly name lookup table exceeded its declared size"
        );
        self.next_name_id += 1;
        self.names.insert(value.to_string(), id);
        rows.push(RdfStreamRow {
            row: Some(Row::Name(RdfNameEntry {
                id,
                value: value.to_string(),
            })),
        });
        id
    }

    fn ensure_datatype(&mut self, value: &str, rows: &mut Vec<RdfStreamRow>) -> u32 {
        if let Some(id) = self.datatypes.get(value) {
            return *id;
        }

        let id = self.next_datatype_id;
        assert!(
            id <= MAX_DATATYPE_TABLE_SIZE,
            "Jelly datatype lookup table exceeded its declared size"
        );
        self.next_datatype_id += 1;
        self.datatypes.insert(value.to_string(), id);
        rows.push(RdfStreamRow {
            row: Some(Row::Datatype(RdfDatatypeEntry {
                id,
                value: value.to_string(),
            })),
        });
        id
    }
}

fn stream_options() -> RdfStreamOptions {
    RdfStreamOptions {
        stream_name: "lws-notifications".to_string(),
        physical_type: PhysicalStreamType::Quads as i32,
        generalized_statements: false,
        rdf_star: false,
        stream_type: 0,
        rdf_version: 0,
        max_name_table_size: MAX_NAME_TABLE_SIZE,
        max_prefix_table_size: 0,
        max_datatype_table_size: MAX_DATATYPE_TABLE_SIZE,
        logical_type: LogicalStreamType::FlatQuads as i32,
        version: 2,
    }
}

fn encode_quad(quad: &PreparedQuad) -> RdfQuad {
    RdfQuad {
        subject: Some(rdf_quad::Subject::SIri(RdfIri {
            prefix_id: 0,
            name_id: quad.subject,
        })),
        predicate: Some(rdf_quad::Predicate::PIri(RdfIri {
            prefix_id: 0,
            name_id: quad.predicate,
        })),
        object: Some(match &quad.object {
            PreparedObject::Iri(id) => rdf_quad::Object::OIri(RdfIri {
                prefix_id: 0,
                name_id: *id,
            }),
            PreparedObject::Literal { lex, datatype } => rdf_quad::Object::OLiteral(RdfLiteral {
                lex: lex.clone(),
                direction: 0,
                literal_kind: Some(LiteralKind::Datatype(*datatype)),
            }),
        }),
        graph: Some(rdf_quad::Graph::GDefaultGraph(RdfDefaultGraph {})),
    }
}
