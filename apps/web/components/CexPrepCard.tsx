'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileJson } from 'lucide-react';
import type { TaggedTask } from '@/lib/agents';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { Mono } from './ui/Mono';
import { JsonViewer } from './ui/JsonViewer';
import { CopyButton } from './ui/CopyButton';
import { stableStringify } from '@/lib/format';

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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function CexPrepCard() {
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => fetchTasks(signal),
    refetchInterval: 4000,
  });

  const latest = useMemo<TaggedTask | null>(() => {
    const all = tasks.data?.tasks ?? [];
    return (
      all.find(
        (t) =>
          t.origin === 'governance' &&
          isObject(t.payload) &&
          (t.payload as Record<string, unknown>).action === 'generate_cex_metadata',
      ) ?? null
    );
  }, [tasks.data]);

  const metadata: unknown = latest
    ? isObject(latest.payload) && 'metadata' in latest.payload
      ? (latest.payload as Record<string, unknown>).metadata
      : latest.payload
    : null;

  function onDownload() {
    if (!metadata) return;
    const blob = new Blob([stableStringify(metadata, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atos-cex-metadata-${latest?.id ?? Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Card state="idle">
      <CardHeader
        title="CEX prep"
        subtitle="latest governance metadata artifact"
        right={
          latest ? (
            <Badge tone="cyan">
              <FileJson size={11} aria-hidden="true" />
              metadata
            </Badge>
          ) : (
            <Badge tone="neutral">no artifact</Badge>
          )
        }
      />
      <CardBody>
        {!latest ? (
          <div className="atos-empty">
            {`> waiting for governance →`}
            <br />
            {`>   generate_cex_metadata`}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-operator-muted">
              <span>CID</span>
              <span className="flex items-center gap-1">
                <Mono value={latest.id} head={10} tail={8} copy />
              </span>
            </div>
            <JsonViewer value={metadata} maxHeight={220} />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <CopyButton value={latest.id} label="Copy CID" />
              <button
                type="button"
                onClick={onDownload}
                className="atos-btn"
                aria-label="Download metadata JSON"
              >
                <Download size={13} aria-hidden="true" />
                <span>Download JSON</span>
              </button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
