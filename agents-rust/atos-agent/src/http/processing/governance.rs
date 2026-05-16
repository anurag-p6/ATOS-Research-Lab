//! Governance-agent task processor.
//!
//! For `generate_cex_metadata`: builds the CEX listing artifact JSON, computes its
//! CIDv1 (the "artifact CID" shown in the dashboard), persists the artifact,
//! marks the task "done", and broadcasts on `atos/status`.
//!
//! For any other governance action (e.g. `submit_proposal`): records the proposal
//! payload and broadcasts a "recorded" status.

use atos_p2p::{ipld, topics};

use crate::http::state::AppState;
use crate::http::util::{append_log, now_secs, update_task_status};

pub(in crate::http) async fn process(
    state: &AppState,
    cid: &str,
    action: &str,
    payload: &serde_json::Value,
) {
    tokio::time::sleep(tokio::time::Duration::from_millis(2_000)).await;

    let contract = payload
        .get("contractAddress")
        .and_then(|v| v.as_str())
        .unwrap_or("0x0000000000000000000000000000000000000000");

    let metadata = build_metadata(state, cid, action, contract, payload);

    // The metadata JSON itself gets a CIDv1 — this is the "CEX listing artifact CID".
    let metadata_cid = ipld::cid_of(&metadata);

    // Store in governance's artifact registry.
    {
        let mut artifacts = state.cex_artifacts.lock().await;
        artifacts.insert(cid.to_string(), metadata.clone());
    }

    let result = serde_json::json!({
        "action":          action,
        "taskCid":         cid,
        "metadataCid":     metadata_cid,
        "metadata":        metadata,
        "contractAddress": contract,
        "message":         format!("{action} — artifact CID {}", &metadata_cid[..20]),
        "ipldCid":         cid,
    });

    update_task_status(state, cid, "done", result.clone()).await;
    append_log(state, cid, "task_done", result.clone()).await;

    if let Err(e) = state.handle.publish(topics::STATUS, result).await {
        tracing::warn!(cid, "governance status publish failed: {e:#}");
    }
    tracing::info!(cid, action, artifact_cid = %metadata_cid, "governance: artifact stamped");
}

fn build_metadata(
    state: &AppState,
    cid: &str,
    action: &str,
    contract: &str,
    payload: &serde_json::Value,
) -> serde_json::Value {
    if action == "generate_cex_metadata" {
        // Derive sub-CIDs for logo and whitepaper (deterministic for demo).
        let logo_cid = format!(
            "bafyrei{}",
            &ipld::compute_cid(format!("logo-{cid}").as_bytes())[1..33]
        );
        let wp_cid = format!(
            "bafyrei{}",
            &ipld::compute_cid(format!("wp-{cid}").as_bytes())[1..33]
        );

        serde_json::json!({
            "token_name":       "ATOS Token",
            "symbol":           "ATOS",
            "decimals":         18,
            "contract_address": contract,
            "chain":            "Ethereum Sepolia",
            "total_supply":     "1000000000",
            "audit_status":     "research_poc",
            "kyber_agent_ek":   &state.kyber_ek_hex[..32.min(state.kyber_ek_hex.len())],
            "logo_cid":         logo_cid,
            "whitepaper_cid":   wp_cid,
            "generated_at":     now_secs(),
            "task_cid":         cid,
        })
    } else {
        serde_json::json!({
            "action":   action,
            "taskCid":  cid,
            "proposal": payload.get("note")
                .cloned()
                .unwrap_or(serde_json::json!("governance action recorded")),
            "status":   "recorded",
        })
    }
}
