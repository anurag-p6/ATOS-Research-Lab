//! Background task that drains incoming gossipsub messages from the P2P layer.
//!
//! Runs as a long-lived Tokio task spawned once at agent startup.
//! Incoming [`AgentMessage`]s are:
//!   - Always appended to the events ring buffer (shown in EventTicker).
//!   - If the topic is `atos/tasks`, also recorded as a "received" task entry
//!     (shown in the Task Feed alongside locally-submitted tasks).

use std::sync::Arc;

use atos_p2p::{topics, AgentMessage, PeerId};
use tokio::sync::Mutex;

use super::state::{TaskRecord, MAX_BUFFER};

/// Receive messages from the P2P layer and write them to the shared ring buffers.
/// Designed to run as `tokio::spawn(drain_p2p_events(rx, tasks, events))`.
pub async fn drain_p2p_events(
    mut rx: tokio::sync::mpsc::Receiver<(AgentMessage, PeerId)>,
    tasks: Arc<Mutex<Vec<TaskRecord>>>,
    events: Arc<Mutex<Vec<AgentMessage>>>,
) {
    while let Some((msg, _from)) = rx.recv().await {
        tracing::debug!(
            topic    = %msg.topic,
            ipld_cid = %msg.ipld_cid,
            role     = %msg.role,
            "gossipsub message received"
        );

        // Always record in the events buffer.
        {
            let mut ev = events.lock().await;
            ev.insert(0, msg.clone());
            if ev.len() > MAX_BUFFER {
                ev.truncate(MAX_BUFFER);
            }
        }

        // Task-topic messages are also stored as remote task entries.
        if msg.topic == topics::TASKS {
            let cid = if msg.ipld_cid.is_empty() {
                msg.id.clone()
            } else {
                msg.ipld_cid.clone()
            };

            let mut t = tasks.lock().await;
            t.insert(
                0,
                TaskRecord {
                    id: cid,
                    status: "received".to_string(),
                    source: "remote".to_string(),
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
