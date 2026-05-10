use libp2p::{gossipsub, mdns, swarm::NetworkBehaviour};

#[derive(NetworkBehaviour)]
#[behaviour(out_event = "OutEvent")]
pub(crate) struct AtosBehaviour {
    pub(crate) gossipsub: gossipsub::Behaviour,
    pub(crate) mdns: mdns::tokio::Behaviour,
}

#[derive(Debug)]
#[allow(clippy::large_enum_variant)] // gossipsub::Event is large; boxing fights NetworkBehaviour glue
pub(crate) enum OutEvent {
    Gossipsub(gossipsub::Event),
    Mdns(mdns::Event),
}

impl From<gossipsub::Event> for OutEvent {
    fn from(e: gossipsub::Event) -> Self {
        OutEvent::Gossipsub(e)
    }
}

impl From<mdns::Event> for OutEvent {
    fn from(e: mdns::Event) -> Self {
        OutEvent::Mdns(e)
    }
}
