//! Shared application state and core data types.
//!
//! [`AppState`] is cloned cheaply (all heavy fields behind `Arc`) and passed
//! into every Axum handler via [`axum::extract::State`].

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use atos_p2p::schema::ExecutionLogEntry;
use atos_p2p::{AgentMessage, AgentRole, AtosP2pHandle};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

/// Maximum number of tasks / events kept in the in-memory ring buffers.
pub(super) const MAX_BUFFER: usize = 250;

// ── shared state ─────────────────────────────────────────────────────────────

/// Everything an Axum handler needs, cheaply cloned via `Arc` internals.
#[derive(Clone)]
pub struct AppState {
    pub handle: AtosP2pHandle,
    pub role: AgentRole,
    pub tcp_port: u16,
    pub api_port: u16,
    pub started: Instant,
    /// ML-KEM-768 encapsulation key as hex — generated once at process startup.
    pub kyber_ek_hex: Arc<String>,
    /// Submitted / received tasks, newest first (ring buffer, max `MAX_BUFFER`).
    pub tasks: Arc<Mutex<Vec<TaskRecord>>>,
    /// Decoded gossipsub messages, newest first.
    pub events: Arc<Mutex<Vec<AgentMessage>>>,
    /// Governance-produced CEX metadata artifacts, keyed by task CID.
    pub cex_artifacts: Arc<Mutex<HashMap<String, serde_json::Value>>>,
    /// IPLD execution-log DAG entries, newest first.
    pub exec_log: Arc<Mutex<Vec<ExecutionLogEntry>>>,
}

// ── wire types ────────────────────────────────────────────────────────────────

/// A task record as seen by the frontend — status is mutable (queued → running → done/failed).
/// The `id` field is a real CIDv1(dag-json, sha2-256) of the IPLD TaskNode.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskRecord {
    pub id: String,
    pub status: String,
    pub source: String,
    pub timestamp: u64,
    pub payload: serde_json::Value,
}
