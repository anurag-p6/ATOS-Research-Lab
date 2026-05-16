# syntax=docker/dockerfile:1
# Build context: `agents-rust/` directory (see docker-compose).

FROM rust:bookworm AS builder
WORKDIR /app

COPY rust-toolchain.toml ./
RUN RUST_TOOLCHAIN=$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml | head -1) \
    && rustup toolchain install "${RUST_TOOLCHAIN}" --profile minimal \
    && rustup default "${RUST_TOOLCHAIN}"

COPY Cargo.toml Cargo.lock ./
COPY atos-p2p ./atos-p2p
COPY atos-agent ./atos-agent

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
RUN cargo build --release -p atos-agent

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/atos-agent /usr/local/bin/atos-agent

# libp2p TCP + Axum HTTP (override via command / compose)
EXPOSE 4001/tcp 3001/tcp

# Reads ROLE, PORT, API_PORT, ATOS_BOOTSTRAP_PEERS from environment.
# Railway / Fly.io / Render just need those env vars set — no custom start command required.
CMD ["/bin/sh", "-c", "\
  exec atos-agent \
    --role        \"${ROLE:-deployer}\" \
    --port        \"${PORT:-4001}\" \
    --api-port    \"${API_PORT:-3001}\" \
    ${ATOS_BOOTSTRAP_PEERS:+--bootstrap \"${ATOS_BOOTSTRAP_PEERS}\"} \
"]
