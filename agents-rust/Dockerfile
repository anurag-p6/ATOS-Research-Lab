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
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/atos-agent /usr/local/bin/atos-agent

# libp2p TCP + Axum HTTP (override via command / compose)
EXPOSE 4001/tcp 3001/tcp

ENTRYPOINT ["/usr/local/bin/atos-agent"]
