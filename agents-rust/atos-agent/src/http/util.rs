//! Internal utilities shared across handlers, processors, and the pubsub loop.

use atos_p2p::schema::ExecutionLogEntry;
use atos_p2p::ipld;

use super::state::{AppState, MAX_BUFFER};

// ── timestamp helpers ─────────────────────────────────────────────────────────

pub(super) fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub(super) fn now_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ── demo tx-hash generator ────────────────────────────────────────────────────

/// Deterministic fake tx hash derived from the task CID — looks real for demo.
pub(super) fn fake_tx_hash(seed: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    seed.hash(&mut h);
    let a = h.finish();
    format!(
        "0x{a:016x}{:016x}{:016x}{:016x}",
        a ^ 0xdead_beef,
        a ^ 0xcafe_babe,
        a ^ 0xfeed_face
    )
}

// ── task-store mutations ──────────────────────────────────────────────────────

/// Find the task with `cid` in the state's task list and update its status and payload.
pub(super) async fn update_task_status(
    state: &AppState,
    cid: &str,
    new_status: &str,
    new_payload: serde_json::Value,
) {
    let mut tasks = state.tasks.lock().await;
    if let Some(t) = tasks.iter_mut().find(|t| t.id == cid) {
        t.status = new_status.to_string();
        t.payload = new_payload;
    }
}

// ── IPLD execution-log appender ───────────────────────────────────────────────

/// Stamp a new [`ExecutionLogEntry`] with its own CID (linking to the previous
/// entry), append to the in-memory log, and emit a tracing event.
pub(super) async fn append_log(
    state: &AppState,
    task_cid: &str,
    event: &str,
    data: serde_json::Value,
) {
    let prev_cid = {
        let log = state.exec_log.lock().await;
        log.first().map(|e| e.entry_cid.clone())
    };

    let mut entry = ExecutionLogEntry {
        entry_cid: String::new(),
        task_cid: task_cid.to_string(),
        agent_role: state.role.as_str().to_string(),
        event: event.to_string(),
        data,
        timestamp: now_millis(),
        prev_entry_cid: prev_cid,
    };
    ipld::stamp_log_entry(&mut entry);
    tracing::info!(entry_cid = %entry.entry_cid, event, "IPLD log entry appended");

    let mut log = state.exec_log.lock().await;
    log.insert(0, entry);
    if log.len() > MAX_BUFFER {
        log.truncate(MAX_BUFFER);
    }
}
