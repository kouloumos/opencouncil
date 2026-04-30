'use client';

import { useEffect } from 'react';

interface RenderEntry {
  component: string;
  time: number | null;
  phase: string;
  unnecessary: boolean | null;
  changes: Array<{
    reason: string;
    name: string;
  }>;
}

interface ProfileSession {
  entries: RenderEntry[];
  startTime: number;
}

const PHASE_NAMES: Record<number, string> = {
  1: 'mount',
  2: 'update',
  4: 'unmount',
};

const CHANGE_REASONS: Record<number, string> = {
  1: 'props',
  2: 'state',
  3: 'state',
  4: 'context',
};

let session: ProfileSession | null = null;
let attached = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReactScanGlobal = { ReactScanInternals: { onRender: ((...args: any[]) => void) | null } };

function getReactScanGlobal(): ReactScanGlobal | null {
  return (globalThis as Record<string, unknown>).__REACT_SCAN__ as ReactScanGlobal | null;
}

function doAttach(rsc: ReactScanGlobal) {
  if (attached) return;
  attached = true;

  const internals = rsc.ReactScanInternals;
  const prevOnRender = internals.onRender;

  internals.onRender = (fiber: unknown, renders: Array<Record<string, unknown>>) => {
    prevOnRender?.(fiber, renders);
    if (!session) return;
    for (const r of renders) {
      const componentName = r.componentName as string | null;
      if (!componentName) continue;
      session.entries.push({
        component: componentName,
        time: r.time as number | null,
        phase: PHASE_NAMES[r.phase as number] || 'unknown',
        unnecessary: r.unnecessary as boolean | null,
        changes: (r.changes as Array<{ type: number; name: string }>).map((c) => ({
          reason: CHANGE_REASONS[c.type] || 'unknown',
          name: c.name,
        })),
      });
    }
  };

  console.log(
    '%c[RenderProfiler] Attached to react-scan. Available commands:\n' +
      '  __startProfile()  — start recording renders\n' +
      '  __stopProfile()   — stop and print summary\n' +
      '  __showToolbar()   — show react-scan visual overlay\n' +
      '  __hideToolbar()   — hide overlay',
    'color: #a855f7'
  );
}

/**
 * Try to attach to react-scan. It initializes asynchronously (onActive callback),
 * so we poll briefly if not ready yet.
 */
function attachToReactScan() {
  const rsc = getReactScanGlobal();
  if (rsc) {
    doAttach(rsc);
    return;
  }
  // Poll for up to 5 seconds
  let attempts = 0;
  const interval = setInterval(() => {
    const rsc = getReactScanGlobal();
    if (rsc) {
      clearInterval(interval);
      doAttach(rsc);
    } else if (++attempts > 50) {
      clearInterval(interval);
      console.warn(
        '[RenderProfiler] react-scan not found after 5s. Is the script tag in layout.tsx?'
      );
    }
  }, 100);
}

function startProfile() {
  if (!attached) {
    console.warn('[RenderProfiler] Not attached to react-scan yet. Try again in a moment.');
    return;
  }
  session = { entries: [], startTime: performance.now() };
  console.log(
    '%c[RenderProfiler] Recording started. Perform your interaction, then call __stopProfile()',
    'color: #22c55e; font-weight: bold'
  );
}

function stopProfile(): string {
  if (!session) {
    console.warn('[RenderProfiler] No active session. Call __startProfile() first.');
    return '';
  }

  const elapsed = performance.now() - session.startTime;
  const entries = session.entries;
  session = null;

  // Aggregate by component
  const byComponent = new Map<
    string,
    {
      renders: number;
      totalTime: number;
      unnecessary: number;
      changes: Map<string, number>;
    }
  >();

  for (const entry of entries) {
    let agg = byComponent.get(entry.component);
    if (!agg) {
      agg = { renders: 0, totalTime: 0, unnecessary: 0, changes: new Map() };
      byComponent.set(entry.component, agg);
    }
    agg.renders += 1;
    agg.totalTime += entry.time ?? 0;
    if (entry.unnecessary) agg.unnecessary += 1;
    for (const c of entry.changes) {
      const key = `${c.reason}:${c.name}`;
      agg.changes.set(key, (agg.changes.get(key) ?? 0) + 1);
    }
  }

  // Sort by total time descending
  const sorted = [...byComponent.entries()].sort(
    (a, b) => b[1].totalTime - a[1].totalTime
  );

  const summary = {
    elapsedMs: Math.round(elapsed),
    totalRenders: entries.length,
    components: sorted.map(([name, data]) => ({
      name,
      renders: data.renders,
      totalTimeMs: Math.round(data.totalTime * 100) / 100,
      unnecessaryRenders: data.unnecessary,
      changeBreakdown: Object.fromEntries(data.changes),
    })),
  };

  console.log(
    '%c[RenderProfiler] Session complete',
    'color: #3b82f6; font-weight: bold'
  );
  console.log(`Duration: ${summary.elapsedMs}ms | Total renders: ${summary.totalRenders}`);
  console.log('');
  console.log('Top components by render time:');
  console.table(
    summary.components.slice(0, 20).map((c) => ({
      Component: c.name,
      Renders: c.renders,
      'Time (ms)': c.totalTimeMs,
      Unnecessary: c.unnecessaryRenders,
      'Top change': Object.entries(c.changeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} (${v}x)`)
        .slice(0, 3)
        .join(', '),
    }))
  );

  const json = JSON.stringify(summary, null, 2);
  console.log('');
  console.log(
    '%cCopy the JSON below and paste it to Claude for analysis:',
    'color: #f59e0b; font-weight: bold'
  );
  console.log(json);

  return json;
}

function showToolbar() {
  const reactScan = (window as unknown as Record<string, unknown>).reactScan as ((opts: Record<string, unknown>) => void) | undefined;
  if (reactScan) {
    reactScan({ enabled: true, showToolbar: true, animationSpeed: 'fast' });
    console.log('[RenderProfiler] Visual overlay enabled. Call __hideToolbar() to hide.');
  } else {
    console.warn('[RenderProfiler] window.reactScan not available.');
  }
}

function hideToolbar() {
  const reactScan = (window as unknown as Record<string, unknown>).reactScan as ((opts: Record<string, unknown>) => void) | undefined;
  if (reactScan) {
    reactScan({ enabled: true, showToolbar: false, animationSpeed: 'off' });
  }
}

export default function RenderProfiler() {
  useEffect(() => {
    attachToReactScan();

    const w = window as unknown as Record<string, unknown>;
    w.__startProfile = startProfile;
    w.__stopProfile = stopProfile;
    w.__showToolbar = showToolbar;
    w.__hideToolbar = hideToolbar;

    return () => {
      delete w.__startProfile;
      delete w.__stopProfile;
      delete w.__showToolbar;
      delete w.__hideToolbar;
    };
  }, []);

  return null;
}
