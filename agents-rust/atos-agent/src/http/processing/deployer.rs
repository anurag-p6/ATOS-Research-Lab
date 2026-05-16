//! Deployer-agent task processor.
//!
//! Simulates an on-chain token deployment: waits a realistic delay, constructs
//! a result payload with a deterministic tx hash and block number, marks the task
//! "done", appends an IPLD log entry, and broadcasts the result on `atos/status`.

use atos_p2p::topics;

use crate::http::state::AppState;
use crate::http::util::{append_log, fake_tx_hash, update_task_status};

pub(in crate::http) async fn process(
    state: &AppState,
    cid: &str,
    action: &str,
    payload: &serde_json::Value,
) {
    let delay_ms: u64 = match action {
        "deploy_token" | "create_token_via_factory" => 3_000,
        "seed_uniswap_v3_pool"                      => 5_000,
        _                                            => 2_000,
    };
    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;

    let contract = payload
        .get("contractAddress")
        .and_then(|v| v.as_str())
        .unwrap_or("0x0000000000000000000000000000000000000000");
    let tx_hash = fake_tx_hash(cid);
    let block   = 7_800_000_u64 + (cid.len() as u64 % 1_000);

    let result = serde_json::json!({
        "action":          action,
        "taskCid":         cid,
        "contractAddress": contract,
        "txHash":          tx_hash,
        "blockNumber":     block,
        "network":         payload.get("chainId").cloned().unwrap_or(serde_json::json!(11_155_111)),
        "message":         format!("{action} completed — tx {} block {block}", &tx_hash[..20]),
        "ipldCid":         cid,
    });

    update_task_status(state, cid, "done", result.clone()).await;
    append_log(state, cid, "task_done", result.clone()).await;

    if let Err(e) = state.handle.publish(topics::STATUS, result).await {
        tracing::warn!(cid, "deployer status publish failed: {e:#}");
    }
    tracing::info!(cid, action, "deployer: task done");
}
