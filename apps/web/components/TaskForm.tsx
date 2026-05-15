'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import type { AgentRole } from '@/lib/agents';
import { isHexAddress, tryParseJson } from '@/lib/format';
import { sepolia, filecoinCalibration } from '@/lib/chains';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';

const AGENTS: AgentRole[] = ['deployer', 'monitor', 'governance'];

const ACTIONS: Record<AgentRole, string[]> = {
  deployer: ['deploy_token', 'upgrade_contract'],
  monitor: ['monitor_events', 'check_balance'],
  governance: ['generate_cex_metadata', 'submit_proposal'],
};

const CHAINS = [sepolia, filecoinCalibration] as const;

interface SubmitResponse {
  ok: boolean;
  agent: AgentRole;
  action: string;
  response: unknown;
}

export function TaskForm() {
  const queryClient = useQueryClient();

  const [agent, setAgent] = useState<AgentRole>('deployer');
  const [action, setAction] = useState<string>(ACTIONS.deployer[0] ?? 'deploy_token');
  const [contractAddress, setContractAddress] = useState<string>(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '',
  );
  const [chainId, setChainId] = useState<number>(
    Number(process.env.NEXT_PUBLIC_CHAIN_ID) || sepolia.id,
  );
  const [payloadRaw, setPayloadRaw] = useState<string>('{\n  "note": "operator submitted"\n}');

  const addressValid = useMemo(
    () => contractAddress.trim().length === 0 || isHexAddress(contractAddress),
    [contractAddress],
  );

  const parsed = useMemo(() => tryParseJson(payloadRaw), [payloadRaw]);
  const payloadValid = parsed.ok;

  const canSubmit =
    !!action && addressValid && payloadValid && contractAddress.trim().length > 0;

  const submit = useMutation<SubmitResponse, Error>({
    mutationKey: ['submit-task'],
    mutationFn: async () => {
      const payload = parsed.ok && typeof parsed.value === 'object' && parsed.value !== null
        ? (parsed.value as Record<string, unknown>)
        : {};
      const body = {
        agent,
        action,
        contractAddress: contractAddress.trim(),
        chainId,
        payload,
      };
      const res = await fetch('/api/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as SubmitResponse;
      if (!res.ok || !json.ok) {
        throw new Error(
          typeof json.response === 'object' && json.response && 'error' in (json.response as Record<string, unknown>)
            ? String((json.response as Record<string, unknown>).error)
            : `HTTP ${res.status}`,
        );
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  function onAgentChange(next: AgentRole) {
    setAgent(next);
    const firstAction = ACTIONS[next][0];
    if (firstAction) setAction(firstAction);
  }

  return (
    <Card state="idle" className="atos-respect-reduced-motion">
      <CardHeader
        title="Submit Task"
        subtitle="dispatch a job to one of the libp2p agents"
      />
      <CardBody>
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) submit.mutate();
          }}
        >
          <div className="md:col-span-2">
            <label className="atos-label" htmlFor="contractAddress">
              Contract address (0x…)
            </label>
            <input
              id="contractAddress"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x0000000000000000000000000000000000000000"
              className={`atos-input atos-mono text-xs ${
                addressValid ? '' : 'border-operator-danger/70'
              }`}
              aria-invalid={!addressValid}
            />
            {!addressValid ? (
              <p className="mt-1 text-[11px] text-operator-danger">
                Address must be 0x followed by 40 hex characters.
              </p>
            ) : null}
          </div>

          <div>
            <label className="atos-label" htmlFor="chain">
              Chain
            </label>
            <select
              id="chain"
              className="atos-select text-sm"
              value={chainId}
              onChange={(e) => setChainId(Number(e.target.value))}
            >
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="atos-label" htmlFor="agent">
              Agent
            </label>
            <select
              id="agent"
              className="atos-select text-sm"
              value={agent}
              onChange={(e) => onAgentChange(e.target.value as AgentRole)}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="atos-label" htmlFor="action">
              Action
            </label>
            <select
              id="action"
              className="atos-select text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {ACTIONS[agent].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="atos-label" htmlFor="payload">
              Payload (JSON)
            </label>
            <textarea
              id="payload"
              className={`atos-textarea ${
                payloadValid ? '' : 'border-operator-danger/70'
              }`}
              value={payloadRaw}
              onChange={(e) => setPayloadRaw(e.target.value)}
              spellCheck={false}
              aria-invalid={!payloadValid}
            />
            {!payloadValid ? (
              <p className="mt-1 text-[11px] text-operator-danger">
                Invalid JSON: {parsed.error}
              </p>
            ) : null}
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="text-[11px] text-operator-muted">
              POST <span className="atos-mono">/api/task</span> → forwards to{' '}
              <span className="atos-mono">{agent}</span> agent.
            </div>
            <div className="flex items-center gap-2">
              {submit.isSuccess ? (
                <span className="atos-chip atos-chip-success">
                  <CheckCircle2 size={11} aria-hidden="true" />
                  dispatched
                </span>
              ) : null}
              {submit.isError ? (
                <span
                  className="atos-chip atos-chip-danger"
                  title={submit.error?.message}
                >
                  <AlertTriangle size={11} aria-hidden="true" />
                  {submit.error?.message ?? 'submit failed'}
                </span>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                disabled={!canSubmit || submit.isPending}
                leading={<Send size={14} aria-hidden="true" />}
              >
                {submit.isPending ? 'submitting…' : 'Submit task'}
              </Button>
            </div>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
