---
context: |
  Continuing the editing lag investigation from 2026-04-23. The previous session
  identified bottlenecks via react-scan's visual overlay, but the proposed fixes
  (context memoization, HighlightContext stabilization, uncontrolled textarea,
  stable ContextMenu callback) weren't sufficient to resolve the perceived lag.
  This session built a dev-only RenderProfiler tool that hooks into react-scan
  programmatically, so profiling data can be collected as structured JSON and
  analyzed systematically. The tool is ready but hasn't been used for profiling
  yet — that's the next step.
---

# RenderProfiler — Dev Profiling Tool for Editing Lag

## Background

See [2026-04-23-editing-lag-handoff.md](./2026-04-23-editing-lag-handoff.md) for
the full investigation history. Key takeaway: the four fixes proposed there
weren't sufficient. We need fresh profiling data to identify the real
bottlenecks.

## What was built

A dev-only profiling tool (`src/components/dev/RenderProfiler.tsx`) that hooks
into [react-scan](https://github.com/aidenybai/react-scan) to collect structured
per-component render data. The goal is to make performance profiling
copy-paste-friendly — collect JSON, share it in a conversation or issue, and
analyze without screenshots or guesswork.

## Architecture

Two pieces work together:

**1. react-scan initialization (root layout)**

`src/app/layout.tsx` loads react-scan via a `<script>` tag in `<head>`,
dev-only. This must load *before* React boots so react-scan can hook into
React's internals. A second inline script immediately disables the toolbar
and visual overlay so there's no visual noise during normal development.

**2. RenderProfiler component (locale layout)**

`src/components/dev/RenderProfiler.tsx` is loaded via the standard dev-only
`require()` pattern in `src/app/[locale]/layout.tsx`. On mount, it attaches
an `onRender` callback to react-scan's internals. This callback is a no-op
unless a profiling session is active — zero overhead in normal dev usage.

## How to use

Open a meeting transcript page in the browser, open the console:

```
__startProfile()          // start recording
// ... perform the interaction (click to edit, type, etc.)
__stopProfile()           // stop and print results
```

`__stopProfile()` prints:
- A `console.table` of the top 20 components by render time
- A JSON blob with full per-component data

The JSON includes for each component:
- `renders` — how many times it rendered
- `totalTimeMs` — cumulative render time
- `unnecessaryRenders` — renders that didn't change the DOM
- `changeBreakdown` — what triggered each render (`props:foo`, `state:bar`,
  `context:baz` with counts)

Additional commands:
- `__showToolbar()` — enable react-scan's visual overlay (render highlighting)
- `__hideToolbar()` — disable it

## What needs to happen next

1. **Profile the three key interactions** on a meeting transcript page in
   editing mode (use a transcript with many utterances for realistic results):

   - **Click an utterance to edit** — this was the slowest (3s in previous
     investigation)
   - **Type in the edit textarea** — reported as laggy
   - **General navigation** on a large transcript (~9000 utterances)

2. **Collect the JSON** from each `__stopProfile()` call

3. **Analyze** — look for:
   - Components with high render counts relative to the interaction (e.g.,
     3000+ UtteranceC renders from clicking one utterance)
   - Large `unnecessaryRenders` counts
   - `context:*` in changeBreakdown — indicates context cascade
   - High `totalTimeMs` components that shouldn't be re-rendering at all

4. **Fix based on actual data**, not the previous session's theories

## Production safety

- `react-scan` is a dev dependency only
- The script tag is gated behind `process.env.NODE_ENV === 'development'`
- The RenderProfiler component uses the conditional `require()` pattern
  (same as QuickLogin, MobilePreviewReporter) — tree-shaken from production
- The `onRender` callback exits immediately when no session is active

## Key files

| File | Role |
|------|------|
| `src/app/layout.tsx` | react-scan script tag (dev-only, in `<head>`) |
| `src/app/[locale]/layout.tsx` | RenderProfiler conditional require |
| `src/components/dev/RenderProfiler.tsx` | Profiling logic and console API |
| `.context/2026-04-23-editing-lag-handoff.md` | Previous investigation findings |
