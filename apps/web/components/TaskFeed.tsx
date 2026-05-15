'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, RefreshCcw, X } from 'lucide-react';
import type { TaggedTask } from '@/lib/agents';
import { relativeTime } from '@/lib/format';
import { Badge, type BadgeTone } from './ui/Badge';
import { Card, CardBody, CardHeader } from './ui/Card';
import { JsonViewer } from './ui/JsonViewer';
import { Mono } from './ui/Mono';
import { Button } from './ui/Button';

const STATUS_TONE: Record<TaggedTask['status'], BadgeTone> = {
  queued: 'amber',
  received: 'cyan',
  done: 'success',
  failed: 'danger',
};

interface TasksResponse {
  total: number;
  fetchedAt: number;
  tasks: TaggedTask[];
}

async function fetchTasks(signal: AbortSignal): Promise<TasksResponse> {
  const res = await fetch('/api/tasks', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`tasks ${res.status}`);
  return (await res.json()) as TasksResponse;
}

const MAX_ROWS = 80;

export function TaskFeed() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => fetchTasks(signal),
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => (tasks.data?.tasks ?? []).slice(0, MAX_ROWS), [tasks.data]);

  const [selected, setSelected] = useState<TaggedTask | null>(null);

  return (
    <Card state="idle">
      <CardHeader
        title="Task feed"
        subtitle="latest queued + received tasks across all agents"
        right={
          <Button
            variant="ghost"
            onClick={() => void tasks.refetch()}
            leading={
              <RefreshCcw
                size={13}
                className={tasks.isFetching ? 'animate-spin' : ''}
                aria-hidden="true"
              />
            }
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-operator-muted">
              {tasks.data ? `${rows.length} / ${tasks.data.total}` : '…'}
            </span>
          </Button>
        }
      />
      <CardBody className="p-0">
        <div className="relative max-h-[460px] overflow-auto">
          {tasks.isLoading && !tasks.data ? (
            <div className="atos-empty m-4">connecting to /api/tasks…</div>
          ) : null}
          {tasks.isError ? (
            <div className="atos-empty m-4">
              <div className="space-y-2">
                <div>tasks endpoint failed: {tasks.error?.message}</div>
                <button
                  type="button"
                  className="atos-btn"
                  onClick={() => void tasks.refetch()}
                >
                  retry
                </button>
              </div>
            </div>
          ) : null}
          {tasks.data && rows.length === 0 ? (
            <div className="atos-empty m-4">
              {`> awaiting task signal`}
              <br />
              {`>_`}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-bg-raised/95 backdrop-blur">
                <tr className="text-[10.5px] uppercase tracking-[0.18em] text-operator-muted">
                  <th className="px-4 py-2 font-medium">time</th>
                  <th className="px-2 py-2 font-medium">agent</th>
                  <th className="px-2 py-2 font-medium">action</th>
                  <th className="px-2 py-2 font-medium">status</th>
                  <th className="px-2 py-2 font-medium">id / cid</th>
                  <th className="px-4 py-2 text-right font-medium">·</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const action =
                    typeof t.payload?.action === 'string'
                      ? (t.payload.action as string)
                      : '—';
                  return (
                    <tr
                      key={`${t.origin}-${t.id}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(t);
                        }
                      }}
                      onClick={() => setSelected(t)}
                      className="cursor-pointer border-t border-line hover:bg-operator-cyan/[0.04] focus:bg-operator-cyan/[0.06] focus:outline-none"
                    >
                      <td className="atos-numeric whitespace-nowrap px-4 py-2 text-operator-muted">
                        {now ? relativeTime(t.timestamp, now) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone="neutral">{t.origin}</Badge>
                      </td>
                      <td className="atos-mono px-2 py-2 text-operator-text/85">
                        {action}
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Mono value={t.id} head={6} tail={6} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ChevronRight
                          size={14}
                          className="inline-block text-operator-muted"
                          aria-hidden="true"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </CardBody>

      {selected ? <TaskDrawer task={selected} onClose={() => setSelected(null)} /> : null}
    </Card>
  );
}

function TaskDrawer({ task, onClose }: { task: TaggedTask; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label="Task details"
      className="fixed inset-0 z-30 flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="atos-card atos-shadow-glow flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-5"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h4 className="atos-heading text-sm uppercase tracking-[0.2em] text-operator-text">
              Task detail
            </h4>
            <p className="mt-0.5 text-[11px] text-operator-muted">
              origin · <span className="atos-mono">{task.origin}</span> · source ·{' '}
              <span className="atos-mono">{task.source}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task detail"
            className="atos-btn atos-btn-ghost"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        <dl className="grid grid-cols-3 gap-y-2 text-[11px]">
          <dt className="text-operator-muted">id</dt>
          <dd className="col-span-2">
            <Mono value={task.id} head={10} tail={8} copy />
          </dd>
          <dt className="text-operator-muted">status</dt>
          <dd className="col-span-2">
            <Badge tone={STATUS_TONE[task.status]}>{task.status}</Badge>
          </dd>
          <dt className="text-operator-muted">timestamp</dt>
          <dd className="atos-mono col-span-2 text-operator-text/85">
            {new Date(task.timestamp).toISOString()}
          </dd>
        </dl>
        <div>
          <div className="atos-label">payload</div>
          <JsonViewer value={task.payload} maxHeight={420} />
        </div>
      </aside>
    </div>
  );
}
