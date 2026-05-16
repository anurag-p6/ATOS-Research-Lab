use serde::{Deserialize, Serialize};

/// Wire message exchanged on the gossipsub topics `atos/tasks`, `atos/status`,
/// `atos/heartbeat`.
///
/// `ipldCid` carries the CIDv1(dag-json, sha2-256) of the associated IPLD
/// node (TaskNode, AgentStateNode, or empty for heartbeats).  The frontend
/// renders it in the EventTicker / TaskFeed to demonstrate content addressing.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    /// Process-local unique id (ts + seq counter).
    pub id: String,
    /// CIDv1 of the IPLD node backing this message (empty string for heartbeats).
    #[serde(default)]
    pub ipld_cid: String,
    /// "deployer" | "monitor" | "governance"
    pub role: String,
    /// "atos/tasks" | "atos/status" | "atos/heartbeat"
    pub topic: String,
    /// Unix epoch milliseconds.
    pub timestamp: u64,
    /// Arbitrary JSON payload.
    pub payload: serde_json::Value,
}
