use crate::command::Cmd;
use crate::config::AtosP2pConfig;
use crate::handle::AtosP2pHandle;
use crate::message::AgentMessage;
use crate::swarm;
use anyhow::Result;
use libp2p::{identity, PeerId};
use tokio::sync::mpsc;

/// Spawns a Tokio task that runs the libp2p swarm. Returns a handle and a stream of `(message, source_peer)`.
pub async fn spawn(
    config: AtosP2pConfig,
) -> Result<(AtosP2pHandle, mpsc::Receiver<(AgentMessage, PeerId)>)> {
    let (event_tx, event_rx) = mpsc::channel::<(AgentMessage, PeerId)>(256);
    let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>(32);

    let keypair = identity::Keypair::generate_ed25519();
    let peer_id = keypair.public().to_peer_id();
    let role_str = config.role.as_str().to_string();
    let listen_port = config.tcp_listen_port;
    let bootstrap = config.bootstrap_multiaddrs.clone();

    tokio::spawn(swarm::run(
        keypair,
        role_str,
        listen_port,
        bootstrap,
        event_tx,
        cmd_rx,
    ));

    Ok((AtosP2pHandle::new(peer_id, cmd_tx), event_rx))
}
