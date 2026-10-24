//! `cbor-ld` only uses tokio from its optional CLI binary. Golem builds the
//! library with `default-features = false`, so this stub keeps tokio's runtime
//! out of the wasm component.
