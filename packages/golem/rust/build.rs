fn main() {
    // Use a vendored protoc so the build does not depend on a system install.
    let protoc = protoc_bin_vendored::protoc_bin_path().expect("vendored protoc");
    // SAFETY: build scripts run single-threaded before compilation starts.
    unsafe {
        std::env::set_var("PROTOC", protoc);
    }
    prost_build::compile_protos(&["proto/rdf.proto"], &["proto"])
        .expect("compile Jelly-RDF protobuf schema");
}
