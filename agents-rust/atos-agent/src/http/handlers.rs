//! All Axum HTTP route handlers.
//!
//! Routes are wired in [`super::router`]; each handler receives [`AppState`]
//! via [`axum::extract::State`] and returns JSON.
//!
//! Handler groups:
//!   - **Agent info**   — `/status`, `/tasks`, `/events`
//!   - **Task submission** — `POST /task`
//!   - **IPLD**         — `/ipld/state`, `/ipld/log`
//!   - **Governance**   — `/cex-metadata`

use atos_p2p::ipld;
use atos_p2p::schema::{AgentStateNode, TaskNode, TaskStatus};
use atos_p2p::topics;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;

use super::processing::process_task_by_role;
use super::state::{AppState, TaskRecord, MAX_BUFFER};
use super::util::{append_log, now_millis, now_secs};

// ── agent-info handlers ───────────────────────────────────────────────────────

pub(super) async fn get_status(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let snap = state
        .handle
        .snapshot()
        .await
        .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "role":              state.role.as_str(),
        "apiPort":           state.api_port,
        "tcpPort":           state.tcp_port,
        "peerId":            state.handle.peer_id_string(),
        "connectedPeers":    snap.connected_peers,
        "connectionCount":   snap.connection_count,
        "uptimeSecs":        state.started.elapsed().as_secs(),
        "kyberEkFingerprint": &state.kyber_ek_hex[..32.min(state.kyber_ek_hex.len())],
        "pqcStatus":         "ML-KEM-768 keypair initialised (Crystal-Kyber NIST FIPS 203)",
    })))
}

pub(super) async fn get_tasks(State(state): State<AppState>) -> Json<serde_json::Value> {
    let tasks = state.tasks.lock().await;
    Json(serde_json::json!({
        "total": tasks.len(),
        "tasks": tasks.as_slice(),
    }))
}

pub(super) async fn get_events(State(state): State<AppState>) -> Json<serde_json::Value> {
    let events = state.events.lock().await;
    Json(serde_json::json!({
        "total": events.len(),
        "events": events.as_slice(),
    }))
}

// ── task-submission handler ───────────────────────────────────────────────────

/// Accept a task from the operator, stamp it with an IPLD CIDv1, persist it,
/// broadcast on `atos/tasks`, and spawn a background processor.
pub(super) async fn post_task(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<TaskRecord>), (StatusCode, String)> {
    let ts = now_millis();
    let action = payload
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    // Link to the previous task node (DAG chain).
    let parent_cid = {
        let tasks = state.tasks.lock().await;
        tasks.first().map(|t| t.id.clone())
    };

    // Stamp a real CIDv1(dag-json, sha2-256) for this task.
    let mut task_node = TaskNode {
        task_cid: String::new(),
        agent_role: state.role.as_str().to_string(),
        action: action.clone(),
        payload: payload.clone(),
        parent_cid: parent_cid.clone(),
        timestamp: ts,
        status: TaskStatus::Pending,
    };
    ipld::stamp_task_node(&mut task_node);
    let cid = task_node.task_cid.clone();

    tracing::info!(
        role  = state.role.as_str(),
        action = %action,
        cid    = %cid,
        "IPLD TaskNode stamped"
    );

    // Persist to in-memory task store.
    let record = TaskRecord {
        id: cid.clone(),
        status: "queued".to_string(),
        source: "local".to_string(),
        timestamp: ts,
        payload: payload.clone(),
    };
    {
        let mut tasks = state.tasks.lock().await;
        tasks.insert(0, record.clone());
        if tasks.len() > MAX_BUFFER {
            tasks.truncate(MAX_BUFFER);
        }
    }

    // Append first IPLD log entry for this task.
    append_log(
        &state,
        &cid,
        "task_queued",
        serde_json::json!({ "action": action, "source": "local" }),
    )
    .await;

    // Broadcast task on the gossipsub network.
    let broadcast = serde_json::json!({
        "action":    action,
        "taskCid":   cid,
        "parentCid": parent_cid,
        "agentRole": state.role.as_str(),
        "timestamp": ts,
        "data":      payload,
    });
    state
        .handle
        .publish(topics::TASKS, broadcast)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    // Role-specific processing runs in a separate Tokio task.
    let (state_bg, cid_bg, action_bg, payload_bg) =
        (state.clone(), cid.clone(), action.clone(), payload.clone());
    tokio::spawn(async move {
        process_task_by_role(state_bg, cid_bg, action_bg, payload_bg).await;
    });

    Ok((StatusCode::ACCEPTED, Json(record)))
}

// ── IPLD handlers ─────────────────────────────────────────────────────────────

/// Compute and return a fresh IPLD `AgentStateNode` for this agent.
/// The node is stamped with its own CIDv1 so the caller can verify content integrity.
pub(super) async fn get_ipld_state(State(state): State<AppState>) -> Json<serde_json::Value> {
    let (completed_cids, current_cid) = {
        let tasks = state.tasks.lock().await;
        let done: Vec<String> = tasks
            .iter()
            .filter(|t| t.status == "done")
            .map(|t| t.id.clone())
            .collect();
        let current = tasks
            .iter()
            .find(|t| t.status == "queued" || t.status == "running")
            .map(|t| t.id.clone());
        (done, current)
    };

    let mut node = AgentStateNode {
        state_cid: String::new(),
        peer_id: state.handle.peer_id_string(),
        role: state.role.as_str().to_string(),
        kyber_ek_hex: state.kyber_ek_hex.as_ref().clone(),
        current_task_cid: current_cid,
        completed_task_cids: completed_cids,
        uptime_secs: state.started.elapsed().as_secs(),
        snapshot_ts: now_secs(),
    };
    ipld::stamp_state_node(&mut node);

    Json(serde_json::json!({
        "stateCid": node.state_cid,
        "node":     node,
        "codec":    "dag-json (0x0129)",
        "hash":     "sha2-256",
    }))
}

/// Return the last 50 IPLD execution-log entries as a DAG chain.
pub(super) async fn get_ipld_log(State(state): State<AppState>) -> Json<serde_json::Value> {
    let log = state.exec_log.lock().await;
    let entries: Vec<_> = log.iter().take(50).cloned().collect();
    Json(serde_json::json!({
        "total":   log.len(),
        "entries": entries,
    }))
}

// ── governance handler ────────────────────────────────────────────────────────

/// Return all CEX metadata artifacts produced by the governance agent.
pub(super) async fn get_cex_metadata(State(state): State<AppState>) -> Json<serde_json::Value> {
    let artifacts = state.cex_artifacts.lock().await;
    let list: Vec<_> = artifacts
        .iter()
        .map(|(k, v)| serde_json::json!({ "taskCid": k, "metadata": v }))
        .collect();
    Json(serde_json::json!({ "total": list.len(), "artifacts": list }))
}

