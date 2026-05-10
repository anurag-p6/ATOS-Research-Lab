use std::time::{Instant, SystemTime};

pub(crate) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn uuid_like_id() -> String {
    let n = Instant::now().elapsed().as_nanos();
    format!("{n:x}")
}
