//! ATOS agent binary: libp2p gossipsub + mDNS, plus Axum HTTP (same routes as TypeScript `agents`).

mod http;

use anyhow::Result;
use atos_p2p::{topics, AgentRole, AtosP2pConfig};
use clap::Parser;
use http::{drain_p2p_events, AppState};
use serde_json::json;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tokio::signal;
use tracing::{info, warn};

#[derive(Parser, Debug)]
#[command(name = "atos-agent", about = "ATOS Rust agent (P2P + Axum HTTP)")]
struct Args {
    /// deployer | monitor | governance
    #[arg(long, default_value = "deployer")]
    role: String,

    /// TCP listen port (libp2p)
    #[arg(long, default_value_t = 4001)]
    port: u16,

    /// HTTP API port (Axum)
    #[arg(long, default_value_t = 3001)]
    api_port: u16,

    /// Bootstrap multiaddrs (comma-separated or repeat `--bootstrap`)
    #[arg(long, value_delimiter = ',', action = clap::ArgAction::Append)]
    bootstrap: Vec<String>,
}

fn bootstrap_from_env() -> Vec<String> {
    std::env::var("ATOS_BOOTSTRAP_PEERS")
        .ok()
        .into_iter()
        .flat_map(|s| {
            s.split(',')
                .map(str::trim)
                .filter(|x| !x.is_empty())
                .map(String::from)
                .collect::<Vec<_>>()
        })
        .collect()
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();
    let role = AgentRole::parse(&args.role)?;

    let mut bootstrap = args.bootstrap;
    bootstrap.extend(bootstrap_from_env());

    let config = AtosP2pConfig {
        role,
        tcp_listen_port: args.port,
        bootstrap_multiaddrs: bootstrap,
    };

    let (handle, rx) = atos_p2p::spawn(config).await?;

    let tasks = Arc::new(Mutex::new(Vec::new()));
    let events = Arc::new(Mutex::new(Vec::new()));
    tokio::spawn(drain_p2p_events(
        rx,
        tasks.clone(),
        events.clone(),
    ));

    let state = AppState {
        handle: handle.clone(),
        role,
        tcp_port: args.port,
        api_port: args.api_port,
        started: Instant::now(),
        tasks,
        events,
    };

    let api_port = args.api_port;
    tokio::spawn(async move {
        if let Err(e) = http::serve(state, api_port).await {
            tracing::error!(error = %format!("{e:#}"), "HTTP server exited");
        }
    });

    info!(
        peer_id = %handle.peer_id_string(),
        port = args.port,
        api_port = args.api_port,
        "ATOS agent started (P2P + Axum)"
    );

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
    interval.tick().await;

    loop {
        tokio::select! {
            _ = interval.tick() => {
                let payload = json!({
                    "peerId": handle.peer_id_string(),
                    "status": "alive",
                });
                if let Err(e) = handle.publish(topics::HEARTBEAT, payload).await {
                    warn!(error = %format!("{e:#}"), "heartbeat publish failed");
                }
            }
            _ = signal::ctrl_c() => {
                info!("shutdown");
                break;
            }
        }
    }

    Ok(())
}
