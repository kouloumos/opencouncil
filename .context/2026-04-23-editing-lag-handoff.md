---
context: |
  Reviewers reported lag in the transcript editing interface after the scrolling
  fix PR (#289, commit e5b31986). We spent a full session investigating — started
  with a React context re-render cascade theory, built a 5-commit context split,
  then discovered via react-scan that the actual bottlenecks were simpler. This
  document captures everything learned so the next session can start fresh from
  main with the right diagnosis.
---

# Transcript Editing Lag — Investigation Handoff

## Problem

After the scrolling fix (PR #289, `e5b31986`), reviewers experience lag in the
editing interface. Reported as: "it's as if everything sticks a little — when
clicking to edit, when typing, when adding a new speaker."

The scrolling fix removed the `renderMock` system (lightweight text-only
rendering for off-screen segments) and replaced it with `content-visibility:
auto` CSS. This means every segment now renders the full interactive component
tree (tooltips, context menus, buttons, etc.) with full context subscriptions.

## What react-scan revealed

We added react-scan (`https://unpkg.com/react-scan/dist/auto.global.js` in the
root layout, dev-only) and profiled three interactions:

### 1. Typing in the edit textarea

- **React render time: 0ms** — rendering isn't the issue
- **JS event handlers: 576ms** — the bottleneck
- The textarea is controlled (`value={editedText}`, `onChange`), so every
  keystroke triggers `setEditedText` → UtteranceC re-renders → 8 Tooltip/Radix
  components re-render (save button, cancel button, timestamp controls)
- **Fix**: Switch to uncontrolled textarea (`defaultValue` + `ref`). Read the
  value from the ref on save. Zero re-renders during typing.

### 2. Clicking an utterance to edit

- **Total: 3008ms**, React render: 491ms, JS handlers: 2472ms
- **3214 UtteranceC renders**, all caused by `UnnamedContext:3214x`
- Each UtteranceC re-render cascades through ~10 Radix ContextMenu wrapper
  components (ContextMenuTrigger, Menu, MenuProvider, Popper, etc.)

**Root cause chain**:
1. Click → `seekToWithoutScroll` → `setCurrentTime` in VideoProvider
2. `VideoContext` value is a **plain object literal** (not memoized) → new object
3. `HighlightProvider` subscribes to `useVideo()` → re-renders
4. `HighlightProvider` callbacks (`goToPreviousHighlight`, etc.) depend on
   `seekToAndPlay` from `useVideo()` — which is a new function reference
5. Callbacks change → `HighlightContext` useMemo value changes
6. Every `useHighlight()` consumer (every UtteranceC) re-renders
7. Each UtteranceC has an inline `onOpenChange` on ContextMenu → cascades
   through 10+ Radix components

### 3. FPS drops during editing (larger transcript, ~9000 utterances)

- React render: 1554ms, other: 4710ms
- Same pattern: `UnnamedContext:9283x` causing mass UtteranceC re-renders
- Additional finding: **ShareContext**, **KeyboardShortcutsContext**, and
  **TranscriptOptionsContext** all have non-memoized context values (plain
  object literals). Any provider re-render creates a new value → all consumers
  re-render.

## Confirmed fixes needed (in priority order)

### Fix 1: Memoize context values

These three contexts create new value objects on every render:

**`src/contexts/ShareContext.tsx`** (line 44): Plain object → wrap in `useMemo`

**`src/contexts/KeyboardShortcutsContext.tsx`** (line 137): Plain object → wrap
in `useMemo`. The callbacks (`registerShortcut`, `unregisterShortcut`,
`getShortcutLabel`) are already `useCallback`, so the memo deps are stable.

**`src/components/meetings/options/OptionsContext.tsx`** (line 48): Plain object
→ wrap in `useMemo`. Also wrap `updateOptions` in `useCallback` (currently a
plain function).

### Fix 2: Stabilize HighlightContext video dependencies

`HighlightProvider` (`src/components/meetings/HighlightContext.tsx` line 85)
gets `seekTo` and `seekToAndPlay` from `useVideo()`. The `VideoContext` value is
not memoized, so these are new function references on every VideoProvider render.

**Fix**: Use `useVideoActions()` for `seekTo` (stable). Build `seekToAndPlay`
locally:
```typescript
const { seekTo } = useVideoActions(); // stable
const { currentTime, isPlaying, setIsPlaying } = useVideo(); // reactive

const seekToAndPlay = useCallback((time: number) => {
    seekTo(time);
    setIsPlaying(true);
}, [seekTo, setIsPlaying]); // both stable
```

This makes all the highlight navigation callbacks (`goToPreviousHighlight`,
`goToNextHighlight`, `togglePreviewMode`, `openPreviewDialog`) stable, which
keeps the HighlightContext value stable when VideoContext changes.

### Fix 3: Uncontrolled textarea in UtteranceC

`src/components/meetings/transcript/Utterance.tsx` — the editing textarea uses
controlled state (`value={editedText}`, `onChange`). Every keystroke triggers a
re-render of the entire editing UI including 4 Tooltip components.

**Fix**: Switch to `defaultValue={localUtterance.text}` + `useRef`. Read from
`textareaRef.current.value` in `handleEdit`. Remove `editedText`/`setEditedText`
state entirely.

### Fix 4: Stable ContextMenu onOpenChange callback

The `ContextMenu onOpenChange` in UtteranceC (line ~489) is an inline function.
Every UtteranceC re-render creates a new function → ContextMenu re-renders →
cascades through 10+ Radix components.

**Fix**: Wrap in `useCallback`. **Important**: place it before the early returns
in the component (lines 306, 310, 454, 463) to satisfy React's hooks rules.

## What we tried that may or may not be needed

We built a 5-commit context split of `CouncilMeetingDataContext` into a stable
main context + volatile transcript context. The theory was that `setTranscript`
changing the context value caused mass re-renders. This is architecturally sound
but react-scan showed the actual dominant costs were the simpler issues above.

**The context split may still be valuable** as a preventive measure (it does
eliminate a real cascade path), but it wasn't sufficient to fix the perceived lag
on its own. The fixes above (context memoization, HighlightContext video deps,
uncontrolled textarea) target the actual measured bottlenecks.

**Recommendation**: Start with just the 4 fixes above on a clean branch from
main. Test with react-scan. If lag persists, then consider the context split.

## Key files

| File | Role |
|------|------|
| `src/components/meetings/transcript/Utterance.tsx` | The editing component — textarea, click handlers, ContextMenu |
| `src/components/meetings/HighlightContext.tsx` | Highlight state — subscribes to useVideo(), provides to all Utterances |
| `src/components/meetings/VideoProvider.tsx` | Video state — non-memoized value, useVideoActions for stable refs |
| `src/contexts/ShareContext.tsx` | Share dropdown state — non-memoized value |
| `src/contexts/KeyboardShortcutsContext.tsx` | Keyboard shortcuts — non-memoized value |
| `src/components/meetings/options/OptionsContext.tsx` | Transcript options — non-memoized value |
| `src/components/meetings/CouncilMeetingDataContext.tsx` | Main data context — has transcript in useMemo deps |
| `src/components/meetings/EditingContext.tsx` | Selection state — allUtterances memo depends on transcript |

## How to use react-scan for validation

Add to `src/app/layout.tsx` inside `<head>`:
```tsx
{process.env.NODE_ENV === 'development' && (
    <script src="https://unpkg.com/react-scan/dist/auto.global.js" crossOrigin="anonymous" />
)}
```

It shows a floating toolbar. Click an utterance, type, etc. Look at:
- Component render counts (should be 1-2 for the edited utterance, not thousands)
- The "Formatted Data" in the optimize tab — paste it to Claude for analysis
- Purple/red highlights = frequently re-rendering components

## Existing PR

PR #318 (`fix/editing-lag-context-split`) has the full context split + these
fixes layered on top. If starting fresh, the 4 targeted fixes above are the
minimum viable change.
