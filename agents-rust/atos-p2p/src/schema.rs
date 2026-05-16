//! IPLD DAG-JSON schemas for ATOS agent state and task graphs.
//!
//! Every struct here is the canonical "node" in the DAG:
//!   - serialised to JSON with stable key ordering
//!   - hashed with SHA2-256
//!   - wrapped in CIDv1 (dag-json codec 0x0129)
//!
//! No external IPFS node is needed — CIDs are computed in-memory and
//! stored/logged here.  This gives content-addressable, verifiable
//! task/state data without the IPFS stack.

use serde::{Deserialize, Serialize};

// ── task DAG ─────────────────────────────────────────────────────────────────

/// Lifecycle of a single orchestration task.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Pending,
    Running,
    Done,
    Failed,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::Running => "running",
            TaskStatus::Done => "done",
            TaskStatus::Failed => "failed",
        }
    }
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// IPLD task node — every field contributes to the CID.
///
/// `parent_cid` links to the previous task in the agent's execution DAG,
/// giving a verifiable chain of operations.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskNode {
    /// CIDv1 of this node (computed after serialisation, stored for reference).
    pub task_cid: String,
    /// "deployer" | "monitor" | "governance"
    pub agent_role: String,
    /// e.g. "deploy_token", "monitor_events", "generate_cex_metadata"
    pub action: String,
    /// Arbitrary JSON payload submitted by the operator.
    pub payload: serde_json::Value,
    /// CID of the preceding task node — forms a linked DAG.
    pub parent_cid: Option<String>,
    /// Unix epoch milliseconds.
    pub timestamp: u64,
    /// Current lifecycle state.
    pub status: TaskStatus,
}

impl TaskNode {
    /// Serialise deterministically (sorted keys via `BTreeMap` serialisation
    /// inside serde_json) so the same content always hashes to the same CID.
    pub fn to_dag_json(&self) -> Vec<u8> {
        // serde_json preserves struct field order as declared, which is stable
        // enough for a PoC CID.  Production code would use libipld dag-json canonicaliser.
        serde_json::to_vec(self).unwrap_or_default()
    }
}

// ── agent state node ──────────────────────────────────────────────────────────

/// Snapshot of an agent's state — useful for querying task history.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStateNode {
    /// CIDv1 of this snapshot.
    pub state_cid: String,
    /// libp2p PeerId as base58 string.
    pub peer_id: String,
    /// "deployer" | "monitor" | "governance"
    pub role: String,
    /// ML-KEM-768 encapsulation key (public) as hex string — PQC stub.
    pub kyber_ek_hex: String,
    /// CID of the task currently being processed, if any.
    pub current_task_cid: Option<String>,
    /// CIDs of all completed tasks since agent start.
    pub completed_task_cids: Vec<String>,
    /// Seconds since agent process started.
    pub uptime_secs: u64,
    /// Unix epoch seconds of this snapshot.
    pub snapshot_ts: u64,
}

impl AgentStateNode {
    pub fn to_dag_json(&self) -> Vec<u8> {
        serde_json::to_vec(self).unwrap_or_default()
    }
}

// ── execution log ─────────────────────────────────────────────────────────────

/// A single entry in the agent's execution log DAG.
/// Entries form a singly-linked list (prev_entry_cid) — a verifiable append-only log.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionLogEntry {
    /// CIDv1 of this log entry.
    pub entry_cid: String,
    /// CID of the task this entry belongs to.
    pub task_cid: String,
    /// The agent that generated this entry.
    pub agent_role: String,
    /// A short event label, e.g. "task_queued", "task_done", "publish_ok".
    pub event: String,
    /// Supplementary structured data for this event.
    pub data: serde_json::Value,
    /// Unix epoch milliseconds.
    pub timestamp: u64,
    /// CID of the previous log entry — forms the linked DAG chain.
    pub prev_entry_cid: Option<String>,
}

impl ExecutionLogEntry {
    pub fn to_dag_json(&self) -> Vec<u8> {
        serde_json::to_vec(self).unwrap_or_default()
    }
}
