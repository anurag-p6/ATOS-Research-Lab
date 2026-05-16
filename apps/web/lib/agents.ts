/**
 * Shared types and server-side fetch helpers for the three ATOS agents.
 * These types mirror the Rust agent HTTP API exactly.
 */

export type AgentRole = 'deployer' | 'monitor' | 'governance';

export const AGENT_ROLES: AgentRole[] = ['deployer', 'monitor', 'governance'];

export interface AgentStatus {
  role: AgentRole;
  apiPort: number;
  tcpPort: number;
  peerId: string | null;
  connectedPeers: string[];
  connectionCount: number;
  uptimeSecs: number;
  /** First 32 hex chars of ML-KEM-768 encapsulation key (public). */
  kyberEkFingerprint?: string;
  /** Human-readable PQC status string. */
  pqcStatus?: string;
}

export type AgentTopic = 'atos/tasks' | 'atos/status' | 'atos/heartbeat';

export interface AgentMessage<T = Record<string, unknown>> {
  id: string;
  /** CIDv1(dag-json, sha2-256) of the IPLD node backing this message. */
  ipldCid?: string;
  role: AgentRole;
  topic: AgentTopic;
  timestamp: number;
  payload: T;
}

export interface TaskRecord {
  id: string;
  status: 'queued' | 'received' | 'done' | 'failed';
  source: 'local' | 'remote';
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface AgentHealth {
  role: AgentRole;
  online: boolean;
  latencyMs: number | null;
  status: AgentStatus | null;
  error?: string;
  fetchedAt: number;
}

/** Per-agent URL resolved from server-only env. */
export function agentUrl(role: AgentRole): string {
  switch (role) {
    case 'deployer':
      return process.env.DEPLOYER_AGENT_URL ?? 'http://localhost:3001';
    case 'monitor':
      return process.env.MONITOR_AGENT_URL ?? 'http://localhost:3002';
    case 'governance':
      return process.env.GOVERNANCE_AGENT_URL ?? 'http://localhost:3003';
  }
}

const DEFAULT_TIMEOUT_MS = 4000;

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ res: Response; latencyMs: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
    return { res, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchAgentStatus(role: AgentRole): Promise<AgentHealth> {
  const base = agentUrl(role);
  const url = `${base}/status`;
  const fetchedAt = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(url, { method: 'GET' });
    if (!res.ok) {
      return {
        role,
        online: false,
        latencyMs,
        status: null,
        error: `HTTP ${res.status}`,
        fetchedAt,
      };
    }
    const status = (await res.json()) as AgentStatus;
    return { role, online: true, latencyMs, status, fetchedAt };
  } catch (e: unknown) {
    return {
      role,
      online: false,
      latencyMs: null,
      status: null,
      error: e instanceof Error ? e.message : 'fetch failed',
      fetchedAt,
    };
  }
}

export async function fetchAgentTasks(role: AgentRole): Promise<TaskRecord[]> {
  const base = agentUrl(role);
  try {
    const { res } = await timedFetch(`${base}/tasks`, { method: 'GET' });
    if (!res.ok) return [];
    const json = (await res.json()) as { total: number; tasks: TaskRecord[] };
    return Array.isArray(json.tasks) ? json.tasks : [];
  } catch {
    return [];
  }
}

export async function fetchAgentEvents(
  role: AgentRole,
): Promise<AgentMessage[]> {
  const base = agentUrl(role);
  try {
    const { res } = await timedFetch(`${base}/events`, { method: 'GET' });
    if (!res.ok) return [];
    const json = (await res.json()) as { total: number; events: AgentMessage[] };
    return Array.isArray(json.events) ? json.events : [];
  } catch {
    return [];
  }
}

export async function submitAgentTask(
  role: AgentRole,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const base = agentUrl(role);
  try {
    const { res } = await timedFetch(
      `${base}/task`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000,
    );
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON, return as text
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e: unknown) {
    return {
      ok: false,
      status: 502,
      body: { error: e instanceof Error ? e.message : 'submit failed' },
    };
  }
}

/** Tagged tasks: per-role tasks merged into a single list with provenance. */
export interface TaggedTask extends TaskRecord {
  origin: AgentRole;
}

export interface TaggedEvent extends AgentMessage {
  origin: AgentRole;
}
