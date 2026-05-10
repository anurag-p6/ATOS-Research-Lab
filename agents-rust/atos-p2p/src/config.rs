use crate::role::AgentRole;

pub struct AtosP2pConfig {
    pub role: AgentRole,
    pub tcp_listen_port: u16,
    pub bootstrap_multiaddrs: Vec<String>,
}
