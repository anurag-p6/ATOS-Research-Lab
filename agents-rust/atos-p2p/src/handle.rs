use crate::command::{Cmd, P2pSnapshot};
use anyhow::{Context, Result};
use libp2p::PeerId;
use tokio::sync::mpsc;

/// Handle to the background swarm task.
#[derive(Clone)]
pub struct AtosP2pHandle {
    peer_id: PeerId,
    cmd_tx: mpsc::Sender<Cmd>,
}

impl AtosP2pHandle {
    pub(crate) fn new(peer_id: PeerId, cmd_tx: mpsc::Sender<Cmd>) -> Self {
        Self { peer_id, cmd_tx }
    }

    pub fn peer_id(&self) -> PeerId {
        self.peer_id
    }

    pub fn peer_id_string(&self) -> String {
        self.peer_id.to_string()
    }

    pub async fn publish(&self, topic: &str, payload: serde_json::Value) -> Result<()> {
        let (tx, mut rx) = mpsc::channel(1);
        self.cmd_tx
            .send(Cmd::Publish {
                topic: topic.to_string(),
                payload,
                respond: tx,
            })
            .await
            .context("p2p task stopped")?;
        let res = rx.recv().await.context("publish response channel closed")?;
        res.context("publish failed")
    }

    /// Current libp2p connection list (from the swarm task).
    pub async fn snapshot(&self) -> Result<P2pSnapshot> {
        let (tx, mut rx) = mpsc::channel(1);
        self.cmd_tx
            .send(Cmd::GetSnapshot { respond: tx })
            .await
            .context("p2p task stopped")?;
        rx.recv().await.context("snapshot response channel closed")
    }
}
