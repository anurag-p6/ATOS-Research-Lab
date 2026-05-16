use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

pub(crate) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

static SEQ: AtomicU64 = AtomicU64::new(0);

/// Generates a stable short ID combining epoch-ms and a per-process sequence counter.
/// Format: `<ts_hex>-<seq_hex>` — looks like a CID prefix for demo purposes.
pub(crate) fn uuid_like_id() -> String {
    let ts = now_millis();
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{ts:013x}-{seq:04x}")
}
