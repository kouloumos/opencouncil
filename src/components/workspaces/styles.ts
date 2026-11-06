/**
 * The controls of the workspace screens, in the app's current look: pill
 * buttons, the deep orange that carries white text (--orange-deep, 4.81:1),
 * and 44px targets. Composed onto <Button> through `className`.
 */
export const primaryPillClass =
  'min-h-11 rounded-full bg-[hsl(var(--orange-deep))] px-5 font-semibold text-white shadow-none hover:bg-[hsl(var(--orange-deep))] hover:opacity-90';

export const secondaryPillClass =
  'min-h-11 rounded-full border border-foreground/15 bg-background px-4 font-medium text-foreground shadow-none hover:bg-foreground/[0.04]';

/** A text field inside a workspace form. */
export const fieldClass = 'h-11 rounded-xl border-border bg-background';

/** A status badge: pass one of the tones below. */
export const badgeClass = 'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold';
export const badgeTone = {
  running: 'bg-[hsl(var(--orange)/0.12)] text-[hsl(var(--orange-deep))]',
  done: 'bg-green-500/10 text-green-700',
  failed: 'bg-red-500/10 text-red-700',
} as const;
