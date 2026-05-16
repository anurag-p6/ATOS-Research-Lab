use crate::behaviour::{AtosBehaviour, OutEvent};
use crate::command::{Cmd, P2pSnapshot};
use crate::ipld;
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

    // Tune for a small 3-node demo network:
    //  - flood_publish: always forward to all connected peers, bypassing mesh-size checks
    //  - lower mesh_n thresholds so the mesh is considered healthy with just 2 peers
    //  - fast heartbeat so the mesh converges within seconds of peer connection
    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .heartbeat_initial_delay(Duration::from_secs(2))
        .heartbeat_interval(Duration::from_secs(1))
        .validation_mode(gossipsub::ValidationMode::Permissive)
        .flood_publish(true)
        .mesh_n(2)
        .mesh_n_low(1)
        .mesh_n_high(4)
        .mesh_outbound_min(1)
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
                        // Compute a CIDv1(dag-json, sha2-256) of the payload bytes
                        // so every gossipsub message carries a content-addressed ID.
                        let payload_bytes = serde_json::to_vec(&payload).unwrap_or_default();
                        let ipld_cid = ipld::compute_cid(&payload_bytes);
                        let msg = AgentMessage {
                            id: uuid_like_id(),
                            ipld_cid,
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
                    SwarmEvent::Behaviour(OutEvent::Mdns(mdns::Event::Discovered(list))) => {
                        for (peer_id, multiaddr) in list {
                            tracing::info!(peer = %peer_id, addr = %multiaddr, "mDNS discovered — dialing");
                            if let Err(e) = swarm.dial(multiaddr) {
                                tracing::warn!(peer = %peer_id, "dial failed: {e}");
                            }
                            // add_explicit_peer keeps the peer in the gossipsub mesh
                            // even if the mesh falls below mesh_n_low
                            swarm.behaviour_mut().gossipsub.add_explicit_peer(&peer_id);
                        }
                    }
                    SwarmEvent::Behaviour(OutEvent::Mdns(mdns::Event::Expired(list))) => {
                        for (peer_id, _) in list {
                            tracing::info!(peer = %peer_id, "mDNS expired");
                            swarm.behaviour_mut().gossipsub.remove_explicit_peer(&peer_id);
                        }
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
