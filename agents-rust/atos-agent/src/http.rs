//! Axum HTTP API aligned with the TypeScript `agents` service (`/status`, `/task`, `/tasks`, `/events`).

use std::sync::Arc;
use std::time::Instant;

use atos_p2p::{topics, AgentMessage, AgentRole, AtosP2pHandle, PeerId};
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use tokio::sync::Mutex;
use tokio::net::TcpListener;

const MAX_BUFFER: usize = 250;

#[derive(Clone)]
pub struct AppState {
    pub handle: AtosP2pHandle,
    pub role: AgentRole,
    pub tcp_port: u16,
    pub api_port: u16,
    pub started: Instant,
    pub tasks: Arc<Mutex<Vec<TaskRecord>>>,
    pub events: Arc<Mutex<Vec<AgentMessage>>>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TaskRecord {
    pub id: String,
    pub status: &'static str,
    pub source: &'static str,
    pub timestamp: u64,
    pub payload: serde_json::Value,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/status", get(get_status))
        .route("/task", post(post_task))
        .route("/tasks", get(get_tasks))
        .route("/events", get(get_events))
        .with_state(state)
}

pub async fn serve(state: AppState, api_port: u16) -> anyhow::Result<()> {
    let addr = format!("0.0.0.0:{api_port}");
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "Axum HTTP listening");
    axum::serve(listener, router(state)).await?;
    Ok(())
}

async fn get_status(State(state): State<AppState>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let snap = state
        .handle
        .snapshot()
        .await
        .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, e.to_string()))?;

    let uptime_secs = state.started.elapsed().as_secs();
    Ok(Json(serde_json::json!({
        "role": state.role.as_str(),
        "apiPort": state.api_port,
        "tcpPort": state.tcp_port,
        "peerId": state.handle.peer_id_string(),
        "connectedPeers": snap.connected_peers,
        "connectionCount": snap.connection_count,
        "uptimeSecs": uptime_secs,
    })))
}

async fn get_tasks(State(state): State<AppState>) -> Json<serde_json::Value> {
    let tasks = state.tasks.lock().await;
    Json(serde_json::json!({
        "total": tasks.len(),
        "tasks": tasks.as_slice(),
    }))
}

async fn get_events(State(state): State<AppState>) -> Json<serde_json::Value> {
    let events = state.events.lock().await;
    Json(serde_json::json!({
        "total": events.len(),
        "events": events.as_slice(),
    }))
}

async fn post_task(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<TaskRecord>), (StatusCode, String)> {
    let id = format!(
        "local-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let record = TaskRecord {
        id: id.clone(),
        status: "queued",
        source: "local",
        timestamp,
        payload: payload.clone(),
    };

    {
        let mut tasks = state.tasks.lock().await;
        tasks.insert(0, record.clone());
        if tasks.len() > MAX_BUFFER {
            tasks.truncate(MAX_BUFFER);
        }
    }

    state
        .handle
        .publish(topics::TASKS, payload)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    Ok((StatusCode::ACCEPTED, Json(record)))
}

/// Background: append incoming pubsub messages to ring buffers.
pub async fn drain_p2p_events(
    mut rx: tokio::sync::mpsc::Receiver<(AgentMessage, PeerId)>,
    tasks: Arc<Mutex<Vec<TaskRecord>>>,
    events: Arc<Mutex<Vec<AgentMessage>>>,
) {
    while let Some((msg, _from)) = rx.recv().await {
        {
            let mut ev = events.lock().await;
            ev.insert(0, msg.clone());
            if ev.len() > MAX_BUFFER {
                ev.truncate(MAX_BUFFER);
            }
        }
        if msg.topic == topics::TASKS {
            let mut t = tasks.lock().await;
            t.insert(
                0,
                TaskRecord {
                    id: msg.id.clone(),
                    status: "received",
                    source: "remote",
                    timestamp: msg.timestamp,
                    payload: msg.payload.clone(),
                },
            );
            if t.len() > MAX_BUFFER {
                t.truncate(MAX_BUFFER);
            }
        }
    }
}
