import type { AgentHealth } from './agents';

/** Shape returned by GET /api/agents. */
export interface AgentsResponse {
  fetchedAt: number;
  deployer: AgentHealth;
  monitor: AgentHealth;
  governance: AgentHealth;
}
