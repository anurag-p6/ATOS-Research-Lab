# ATOS Deployment Strategy and Cost Model

This document proposes a production-lean deployment plan for ATOS with explicit scaling tiers, service sizing, and cost estimates.

## 1) Recommended Deployment Architecture

For this project, the best practical setup is:

- Frontend: `Vercel` (Next.js UI, previews, CDN edge delivery)
- Backend and agent network: `AWS` (ECS Fargate, Dockerized services)

Why this split works:

- Vercel gives the fastest frontend iteration and global client performance.
- AWS ECS/Fargate is better for always-on, long-lived `libp2p` agents and container orchestration.

## 2) AWS Services to Use

- Compute: `Amazon ECS on Fargate` (ARM where possible for lower cost)
- Networking: `VPC`, private subnets for services, public ALB subnet
- Ingress: `Application Load Balancer (ALB)` + `AWS WAF`
- Service discovery: `Cloud Map` (for internal service endpoints)
- State cache: `ElastiCache Redis`
- Artifacts: `S3` (reports, governance metadata, logs export)
- Observability: `CloudWatch Logs`, `CloudWatch Metrics`, `X-Ray` (optional)
- Secrets: `Secrets Manager` + task IAM roles
- Optional async control plane: `SQS` for retryable task queues
- Cost protection: VPC endpoints for ECR/S3/CloudWatch to reduce NAT traffic

## 3) Containerized Service Topology

Core containers:

- `web-bff` (optional if not using Vercel API routes)
- `api-gateway` (task submission, status aggregation)
- `deployer-agent`
- `monitor-agent`
- `governance-agent`
- optional `worker-indexer` (aggregation, retries, long jobs)

Each service runs as an ECS service with min healthy replicas and autoscaling policies.

## 4) Scaling Strategy

### 4.1 Horizontal scaling controls

- API services: target tracking on CPU (55-60%) and request count per target
- Agents: scale by queue depth, pubsub lag, and event processing latency
- Cooldowns: scale-out 60s, scale-in 300s (avoid flapping)

### 4.2 Availability strategy

- Multi-AZ deployment for API and critical agents
- Minimum 2 replicas for API path in non-dev environments
- Rolling deployments with health checks and circuit breakers

### 4.3 Networking and cost guardrails

- Use interface/gateway VPC endpoints for ECR, S3, CloudWatch
- Keep NAT gateways minimal and only for unavoidable outbound traffic
- Avoid per-AZ NAT sprawl until traffic justifies it

## 5) Instance/Task Sizing by User Base

Assumptions:

- Region: `us-east-1`
- Backend on ECS Fargate ARM pricing baseline
- MAU-based traffic model with burst factors included in ranges
- Costs are monthly estimates, excluding one-time setup


| User Base    | API Tasks            | Agent Tasks           | Worker Tasks           | Redis                 | Notes            |
| ------------ | -------------------- | --------------------- | ---------------------- | --------------------- | ---------------- |
| 1k-5k MAU    | 2 x (0.5 vCPU, 1 GB) | 3 x (0.5 vCPU, 1 GB)  | 0-1 x (0.5 vCPU, 1 GB) | `cache.t4g.small`     | MVP / pilot      |
| 10k-50k MAU  | 4 x (1 vCPU, 2 GB)   | 6 x (0.5 vCPU, 1 GB)  | 2 x (0.5 vCPU, 1 GB)   | `cache.t4g.medium`    | Early growth     |
| 50k-250k MAU | 8 x (1 vCPU, 2 GB)   | 12 x (0.5 vCPU, 1 GB) | 6 x (1 vCPU, 2 GB)     | `cache.t4g.large`     | Scaling stage    |
| 250k-1M MAU  | 16 x (1 vCPU, 2 GB)  | 24 x (0.5 vCPU, 1 GB) | 16 x (1 vCPU, 2 GB)    | `r6g.large` or higher | High-scale phase |


## 6) Monthly Cost Estimate by User Base (USD)

These are planning bands, not invoice guarantees. Real costs vary by request size, log volume, and outbound traffic.


| Cost Component                 | 1k-5k MAU   | 10k-50k MAU   | 50k-250k MAU    | 250k-1M MAU     |
| ------------------------------ | ----------- | ------------- | --------------- | --------------- |
| ECS Fargate compute            | 70-120      | 220-320       | 550-800         | 1,200-1,700     |
| ALB + LCU                      | 18-30       | 30-60         | 70-130          | 180-280         |
| ElastiCache Redis              | 23-30       | 45-70         | 90-140          | 220-400         |
| CloudWatch logs/metrics        | 10-25       | 25-60         | 60-140          | 150-350         |
| NAT + VPC data processing      | 10-60       | 30-120        | 70-250          | 150-500         |
| S3 artifacts/storage           | 2-10        | 8-20          | 20-50           | 50-120          |
| Data transfer/egress (backend) | 10-40       | 50-180        | 200-700         | 800-2,200       |
| **AWS backend subtotal**       | **143-315** | **408-830**   | **1,060-2,210** | **2,750-5,550** |
| Vercel frontend (typical)      | 20-80       | 80-250        | 250-900         | 900-3,000       |
| **Total platform estimate**    | **163-395** | **488-1,080** | **1,310-3,110** | **3,650-8,550** |


## 7) Cost Accuracy Notes (AWS + Community Signals)

Key findings used in this model:

- Fargate pricing is straightforward per vCPU-hour and GB-hour, but secondary costs dominate at scale.
- ALB cost is usually moderate at low traffic, then LCU dimensions (especially processed bytes) become significant.
- NAT gateways are a common cost surprise in container stacks, especially with repeated image pulls and egress-heavy jobs.
- Community reports repeatedly show NAT + data transfer as top hidden cost drivers if VPC endpoints are not configured.
- For this workload shape, ECS/Fargate is typically lower operational overhead than EKS unless strong Kubernetes-specific needs exist.

## 8) Practical Optimization Plan

Priority order:

1. Enable VPC endpoints (`ecr.api`, `ecr.dkr`, `s3`, `logs`) before traffic ramps.
2. Use ARM Fargate task definitions where dependencies allow.
3. Control log verbosity and retention (default 7-14 days for high-volume streams).
4. Use autoscaling floors conservatively outside business peaks.
5. Move non-critical workers to Fargate Spot where interruption is acceptable.
6. Add per-service cost alarms (AWS Budgets + Cost Anomaly Detection).

## 9) Deployment Phases

- Phase 1 (Pilot): single-region, low replica counts, baseline observability
- Phase 2 (Growth): stronger autoscaling, queue-backed retries, Redis tier upgrade
- Phase 3 (Scale): stricter SLOs, multi-AZ hardening, dedicated worker pools
- Phase 4 (High scale): regional failover planning, advanced traffic controls, cost governance automation

## 10) Source References Used for Pricing/Operational Assumptions

- AWS Fargate pricing: [https://aws.amazon.com/fargate/pricing](https://aws.amazon.com/fargate/pricing)
- Amazon ECS pricing: [https://aws.amazon.com/ecs/pricing](https://aws.amazon.com/ecs/pricing)
- Elastic Load Balancing pricing: [https://aws.amazon.com/elasticloadbalancing/pricing](https://aws.amazon.com/elasticloadbalancing/pricing)
- Amazon VPC / NAT Gateway pricing: [https://aws.amazon.com/vpc/pricing](https://aws.amazon.com/vpc/pricing)
- Amazon CloudFront pricing: [https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/)
- Amazon ElastiCache pricing: [https://aws.amazon.com/elasticache/pricing/](https://aws.amazon.com/elasticache/pricing/)
- ECS autoscaling guidance: [https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html)
- Community/cost-ops discussions (NAT and Fargate cost behavior):
  - [https://dev.to/chayanikaa/cost-optimisation-on-aws-navigating-nat-charges-with-private-ecs-tasks-on-fargate-21lp](https://dev.to/chayanikaa/cost-optimisation-on-aws-navigating-nat-charges-with-private-ecs-tasks-on-fargate-21lp)
  - [https://serverfault.com/questions/1157773/nat-gateway-costs-on-aws](https://serverfault.com/questions/1157773/nat-gateway-costs-on-aws)
  - [https://repost.aws/questions/QU0JyGMj7KRvKSMyPSM6LgVQ/aws-fargate-costs-for-hosting-a-simple-nextjs-server](https://repost.aws/questions/QU0JyGMj7KRvKSMyPSM6LgVQ/aws-fargate-costs-for-hosting-a-simple-nextjs-server)

---

If this is for proposal submission, add one sentence under the table:
"Final numbers will be validated with AWS Pricing Calculator using expected request, payload, and logging profiles collected during pilot telemetry."