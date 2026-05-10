use anyhow::Result;
use serde::Serialize;
use tokio::sync::mpsc;

/// Snapshot of swarm connectivity (for HTTP `/status`).
#[derive(Debug, Clone, Serialize)]
pub struct P2pSnapshot {
    pub connection_count: usize,
    pub connected_peers: Vec<String>,
}

pub(crate) enum Cmd {
    Publish {
        topic: String,
        payload: serde_json::Value,
        respond: mpsc::Sender<Result<()>>,
    },
    GetSnapshot {
        respond: mpsc::Sender<P2pSnapshot>,
    },
}
