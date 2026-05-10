use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: String,
    pub role: String,
    pub topic: String,
    pub timestamp: u64,
    pub payload: serde_json::Value,
}
