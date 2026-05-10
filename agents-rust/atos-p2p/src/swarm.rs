use crate::behaviour::{AtosBehaviour, OutEvent};
use crate::command::{Cmd, P2pSnapshot};
use crate::message::AgentMessage;
use crate::topics;
use crate::util::{now_millis, uuid_like_id};
use anyhow::Result;
use futures::StreamExt;
use libp2p::gossipsub::IdentTopic;
use libp2p::swarm::SwarmEvent;
use libp2p::{gossipsub, identity, mdns, noise, tcp, yamux, Multiaddr, PeerId, SwarmBuilder};
use std::time::Duration;
use tokio::sync::mpsc;

pub(crate) async fn run(
    keypair: identity::Keypair,
    role: String,
    listen_port: u16,
    bootstrap: Vec<String>,
    event_tx: mpsc::Sender<(AgentMessage, PeerId)>,
    mut cmd_rx: mpsc::Receiver<Cmd>,
) {
    if let Err(e) =
        build_and_run_swarm(keypair, role, listen_port, bootstrap, event_tx, &mut cmd_rx).await
    {
        tracing::error!("swarm error: {e:#}");
    }
}

async fn build_and_run_swarm(
    keypair: identity::Keypair,
    role: String,
    listen_port: u16,
    bootstrap: Vec<String>,
    event_tx: mpsc::Sender<(AgentMessage, PeerId)>,
    cmd_rx: &mut mpsc::Receiver<Cmd>,
) -> Result<()> {
    let peer_id = keypair.public().to_peer_id();

    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .heartbeat_initial_delay(Duration::from_secs(5))
        .validation_mode(gossipsub::ValidationMode::Permissive)
        .build()
        .map_err(|e| anyhow::anyhow!("gossipsub config: {e}"))?;

    let mut gossipsub = gossipsub::Behaviour::new(
        gossipsub::MessageAuthenticity::Signed(keypair.clone()),
        gossipsub_config,
    )
    .map_err(|e| anyhow::anyhow!("gossipsub behaviour: {e}"))?;

    for t in [topics::TASKS, topics::STATUS, topics::HEARTBEAT] {
        gossipsub
            .subscribe(&IdentTopic::new(t))
            .map_err(|e| anyhow::anyhow!("gossipsub subscribe {t}: {e}"))?;
    }

    let mdns = mdns::tokio::Behaviour::new(mdns::Config::default(), peer_id)?;
    let behaviour = AtosBehaviour { gossipsub, mdns };

    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )?
        .with_behaviour(|_| Ok(behaviour))?
        .build();

    let listen: Multiaddr = format!("/ip4/0.0.0.0/tcp/{listen_port}").parse()?;
    swarm.listen_on(listen)?;

    for addr in bootstrap {
        let trimmed = addr.trim();
        if trimmed.is_empty() {
            continue;
        }
        match trimmed.parse::<Multiaddr>() {
            Ok(m) => {
                if let Err(e) = swarm.dial(m.clone()) {
                    tracing::warn!("bootstrap dial failed {m}: {e}");
                } else {
                    tracing::info!("bootstrap dial queued: {m}");
                }
            }
            Err(e) => tracing::warn!("invalid bootstrap multiaddr {trimmed:?}: {e}"),
        }
    }

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(Cmd::Publish { topic, payload, respond }) => {
                        let msg = AgentMessage {
                            id: uuid_like_id(),
                            role: role.clone(),
                            topic: topic.clone(),
                            timestamp: now_millis(),
                            payload,
                        };
                        let data = serde_json::to_vec(&msg)?;
                        let r = swarm
                            .behaviour_mut()
                            .gossipsub
                            .publish(IdentTopic::new(topic.clone()), data);
                        let res = r.map(|_| ()).map_err(|e| anyhow::anyhow!("publish: {e:?}"));
                        let _ = respond.send(res).await;
                    }
                    Some(Cmd::GetSnapshot { respond }) => {
                        let connected_peers: Vec<String> = swarm
                            .connected_peers()
                            .map(|p| p.to_string())
                            .collect();
                        let snap = P2pSnapshot {
                            connection_count: connected_peers.len(),
                            connected_peers,
                        };
                        let _ = respond.send(snap).await;
                    }
                    None => break,
                }
            }
            event = swarm.select_next_some() => {
                match event {
                    SwarmEvent::Behaviour(OutEvent::Mdns(e)) => {
                        tracing::debug!(?e, "mdns");
                    }
                    SwarmEvent::Behaviour(OutEvent::Gossipsub(gossipsub::Event::Message {
                        message,
                        ..
                    })) => {
                        if let Ok(m) = serde_json::from_slice::<AgentMessage>(&message.data) {
                            let from = message
                                .source
                                .unwrap_or_else(PeerId::random);
                            let _ = event_tx.send((m, from)).await;
                        }
                    }
                    SwarmEvent::NewListenAddr { address, .. } => {
                        tracing::info!("listening on {address}");
                    }
                    SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                        tracing::info!("connected {peer_id}");
                    }
                    SwarmEvent::ConnectionClosed { peer_id, .. } => {
                        tracing::info!("disconnected {peer_id}");
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}
