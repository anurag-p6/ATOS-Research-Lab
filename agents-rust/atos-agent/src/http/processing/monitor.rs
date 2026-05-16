//! Monitor-agent task processor.
//!
//! Simulates an on-chain event scan: waits a short delay, constructs a result
//! payload with a transfer-event count and last-scanned block number, marks the
//! task "done", appends an IPLD log entry, and broadcasts on `atos/status`.

use atos_p2p::topics;

use crate::http::state::AppState;
use crate::http::util::{append_log, update_task_status};

pub(in crate::http) async fn process(
    state: &AppState,
    cid: &str,
    action: &str,
    payload: &serde_json::Value,
) {
    tokio::time::sleep(tokio::time::Duration::from_millis(1_500)).await;

    let contract   = payload
        .get("contractAddress")
        .and_then(|v| v.as_str())
        .unwrap_or("0x0000000000000000000000000000000000000000");
    let ev_count   = (cid.len() as u64 % 47) + 3;
    let last_block = 7_800_000_u64 + (cid.len() as u64 % 500);

    let result = serde_json::json!({
        "action":              action,
        "taskCid":             cid,
        "contractAddress":     contract,
        "transferEventCount":  ev_count,
        "lastBlock":           last_block,
        "message":             format!("{action} — {ev_count} transfers at block {last_block}"),
        "ipldCid":             cid,
    });

    update_task_status(state, cid, "done", result.clone()).await;
    append_log(state, cid, "task_done", result.clone()).await;

    if let Err(e) = state.handle.publish(topics::STATUS, result).await {
        tracing::warn!(cid, "monitor status publish failed: {e:#}");
    }
    tracing::info!(cid, action, "monitor: task done");
}
