//! ATOS peer-to-peer layer: TCP + Noise + Yamux, mDNS discovery, Gossipsub on `atos/*` topics.
//! Wire format matches the TypeScript agents: JSON [`AgentMessage`] payloads.

mod behaviour;
mod command;
mod config;
mod handle;
mod message;
mod role;
mod spawn;
mod swarm;
pub mod topics;
mod util;

pub use command::P2pSnapshot;
pub use config::AtosP2pConfig;
pub use handle::AtosP2pHandle;
pub use message::AgentMessage;
pub use role::AgentRole;
pub use spawn::spawn;

pub use libp2p::PeerId;
