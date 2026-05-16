//! Post-Quantum Cryptography stub — ML-KEM-768 (NIST FIPS 203 / Crystal-Kyber).
//!
//! Status: **prototype only**.
//! - Keypair generation is real (pure-Rust `ml-kem` v0.3, FIPS 203 compliant).
//! - The encapsulation key (EK, public) is exported as hex and embedded in the
//!   agent's IPLD AgentStateNode and returned by `GET /status`.
//! - The decapsulation key (DK, secret) is held in memory only; never serialised.
//! - Actual PQC-secured libp2p channels are NOT integrated (Noise extension needed).
//!
//! Planned hybrid scheme (roadmap):
//!   Ed25519 (classical) + ML-KEM-768 (PQC) shared-secret mixed into Noise handshake
//!   following the HPKE / Noise_IKpsk2 pattern.

use ml_kem::{
    Decapsulate, Encapsulate, KeyExport, Kem,
    DecapsulationKey, EncapsulationKey, MlKem768,
};

/// Holds the ML-KEM-768 keypair for one agent process.
pub struct KyberKeypair {
    /// Secret decapsulation key — kept in memory, never logged.
    dk: DecapsulationKey<MlKem768>,
    /// Public encapsulation key — shared in IPLD state / logs / `/status`.
    pub ek: EncapsulationKey<MlKem768>,
    /// Hex-encoded public encapsulation key bytes.
    /// ML-KEM-768 EK is 1184 bytes → 2368 hex chars.
    pub ek_hex: String,
}

impl KyberKeypair {
    /// Generate a fresh ML-KEM-768 keypair using the OS CSPRNG.
    /// Requires the `getrandom` feature on `ml-kem`.
    pub fn generate() -> Self {
        let (dk, ek) = MlKem768::generate_keypair();
        // KeyExport::to_bytes() serialises the encapsulation key to its canonical byte form.
        let ek_bytes = ek.to_bytes();
        let ek_hex = hex::encode(ek_bytes);
        Self { dk, ek, ek_hex }
    }

    /// First `len` hex characters of the public key — compact identifier for logs / UI.
    pub fn ek_fingerprint(&self, len: usize) -> String {
        self.ek_hex.chars().take(len).collect()
    }
}

/// Round-trip self-test: encapsulate with the public key, decapsulate with the
/// secret key, and verify the shared secrets match.
/// Returns `true` on success (always true for a correctly generated keypair).
pub fn self_test(kp: &KyberKeypair) -> bool {
    // encapsulate() uses the OS RNG (getrandom feature) → returns (ciphertext, shared_secret)
    let (ct, ss_enc) = kp.ek.encapsulate();
    // decapsulate() → shared_secret (infallible for ML-KEM)
    let ss_dec = kp.dk.decapsulate(&ct);
    ss_enc == ss_dec
}
