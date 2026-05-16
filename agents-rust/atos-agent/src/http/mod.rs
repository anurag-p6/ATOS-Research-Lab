//! HTTP module for the ATOS agent.
//!
//! Module layout:
//! ```text
//! http/
//!   mod.rs          ← router, serve, public re-exports (this file)
//!   state.rs        ← AppState, TaskRecord, MAX_BUFFER
//!   util.rs         ← now_millis, now_secs, fake_tx_hash, update_task_status, append_log
//!   handlers.rs     ← all Axum route handlers
//!   processing/
//!     mod.rs        ← process_task_by_role (dispatch)
//!     deployer.rs   ← deploy simulation
//!     monitor.rs    ← on-chain scan simulation
//!     governance.rs ← CEX metadata artifact generation
//!   pubsub.rs       ← drain_p2p_events (background gossipsub drainer)
//! ```
//!
//! External callers (i.e. `main.rs`) only need:
//!   - [`AppState`]        — to construct and pass into `serve`
//!   - [`serve`]           — to start the Axum server
//!   - [`drain_p2p_events`] — to spawn the gossipsub event loop

mod handlers;
mod processing;
mod pubsub;
mod state;
mod util;

// Public API surfaced to `main.rs`
pub use pubsub::drain_p2p_events;
pub use state::AppState;

use axum::http::Method;
use axum::routing::{get, post};
use axum::Router;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

/// Build the Axum router with CORS and all routes wired.
pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    Router::new()
        .route("/status",       get(handlers::get_status))
        .route("/task",         post(handlers::post_task))
        .route("/tasks",        get(handlers::get_tasks))
        .route("/events",       get(handlers::get_events))
        .route("/ipld/state",   get(handlers::get_ipld_state))
        .route("/ipld/log",     get(handlers::get_ipld_log))
        .route("/cex-metadata", get(handlers::get_cex_metadata))
        .layer(cors)
        .with_state(state)
}

/// Bind to `0.0.0.0:<api_port>` and serve the router until the process exits.
pub async fn serve(state: AppState, api_port: u16) -> anyhow::Result<()> {
    let addr = format!("0.0.0.0:{api_port}");
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "Axum HTTP listening");
    axum::serve(listener, router(state)).await?;
    Ok(())
}
