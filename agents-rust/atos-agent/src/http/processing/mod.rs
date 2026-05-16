//! Role-specific task processing sub-module.
//!
//! [`process_task_by_role`] is the entry point called from the `POST /task`
//! handler.  It transitions the task to "running", dispatches to the appropriate
//! role processor, and each processor is responsible for transitioning to "done"
//! or "failed" and publishing to `atos/status`.
//!
//! Sub-modules (one per agent role):
//!   - [`deployer`]   — simulates token deployment
//!   - [`monitor`]    — simulates on-chain event scan
//!   - [`governance`] — generates CEX metadata artifact

mod deployer;
mod governance;
mod monitor;

use atos_p2p::AgentRole;

use crate::http::state::AppState;
use crate::http::util::{append_log, update_task_status};

/// Transition the task to "running" then dispatch to the role-specific processor.
pub(in crate::http) async fn process_task_by_role(
    state: AppState,
    cid: String,
    action: String,
    payload: serde_json::Value,
) {
    update_task_status(&state, &cid, "running", payload.clone()).await;
    append_log(
        &state,
        &cid,
        "task_running",
        serde_json::json!({ "action": &action }),
    )
    .await;

    match state.role {
        AgentRole::Deployer   => deployer::process(&state, &cid, &action, &payload).await,
        AgentRole::Monitor    => monitor::process(&state, &cid, &action, &payload).await,
        AgentRole::Governance => governance::process(&state, &cid, &action, &payload).await,
    }
}
