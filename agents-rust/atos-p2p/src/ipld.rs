//! CID generation following the IPLD / multiformats spec.
//!
//! Codec:  0x0129  (dag-json)
//! Hash:   SHA2-256 (code 0x12 in the multihash table)
//! Base:   base32 lower (CIDv1 default, "b…" prefix)
//!
//! The `multihash` 0.19 crate no longer bundles the sha2 code table;
//! we use the `sha2` crate directly and wrap the digest in a `Multihash<64>`.

use cid::Cid;
use multihash::Multihash;
use sha2::{Digest, Sha256};

/// DAG-JSON multicodec.
const DAG_JSON: u64 = 0x0129;
/// SHA2-256 multihash code.
const SHA2_256: u64 = 0x12;

/// Compute a CIDv1(dag-json, sha2-256) for arbitrary bytes.
/// Returns a base32-lowercase string ("b…" prefix — the IPLD canonical form).
pub fn compute_cid(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    // Multihash::wrap(code, digest_bytes) → Multihash<64>
    let mh: Multihash<64> = Multihash::wrap(SHA2_256, &digest)
        .expect("sha256 digest is always 32 bytes, within the 64-byte limit");
    let cid = Cid::new_v1(DAG_JSON, mh);
    cid.to_string()
}

/// Compute a CID for any serde-serialisable value (serialised to compact JSON).
pub fn cid_of<T: serde::Serialize>(v: &T) -> String {
    let bytes = serde_json::to_vec(v).unwrap_or_default();
    compute_cid(&bytes)
}

/// Stamp a `TaskNode` with its own CID.
/// Call with `task_cid: String::new()` then this fills `task_cid` in-place.
pub fn stamp_task_node(node: &mut crate::schema::TaskNode) {
    node.task_cid = String::new();
    let bytes = serde_json::to_vec(node).unwrap_or_default();
    node.task_cid = compute_cid(&bytes);
}

/// Stamp an `AgentStateNode` with its own CID.
pub fn stamp_state_node(node: &mut crate::schema::AgentStateNode) {
    node.state_cid = String::new();
    let bytes = serde_json::to_vec(node).unwrap_or_default();
    node.state_cid = compute_cid(&bytes);
}

/// Stamp an `ExecutionLogEntry` with its own CID.
pub fn stamp_log_entry(entry: &mut crate::schema::ExecutionLogEntry) {
    entry.entry_cid = String::new();
    let bytes = serde_json::to_vec(entry).unwrap_or_default();
    entry.entry_cid = compute_cid(&bytes);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cid_is_deterministic() {
        let a = compute_cid(b"hello atos");
        let b = compute_cid(b"hello atos");
        assert_eq!(a, b);
        assert!(a.starts_with('b'), "CIDv1 base32lower starts with 'b', got: {a}");
    }

    #[test]
    fn different_content_different_cid() {
        let a = compute_cid(b"deployer");
        let b = compute_cid(b"governance");
        assert_ne!(a, b);
    }
}
