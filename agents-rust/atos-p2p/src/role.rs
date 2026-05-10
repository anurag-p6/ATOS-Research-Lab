use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    Deployer,
    Monitor,
    Governance,
}

impl AgentRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentRole::Deployer => "deployer",
            AgentRole::Monitor => "monitor",
            AgentRole::Governance => "governance",
        }
    }

    pub fn parse(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "deployer" => Ok(AgentRole::Deployer),
            "monitor" => Ok(AgentRole::Monitor),
            "governance" => Ok(AgentRole::Governance),
            other => anyhow::bail!("unknown role: {other}"),
        }
    }
}
