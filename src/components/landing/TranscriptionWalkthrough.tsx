'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Music2, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';

const STEPS = ['upload', 'transcribe', 'edit', 'export'] as const;
const STEP_MS = 3600;
/** Where the walkthrough rests for a visitor who asked for less motion: the edited transcript. */
const STILL_STEP = 2;

/** The waveform of the transcription step, in percent of its height. */
const BAR_HEIGHTS = [30, 55, 80, 45, 95, 60, 35, 70, 100, 50, 25, 65, 85, 40, 75, 55, 30, 90, 60, 45, 70, 35, 80, 50, 65, 40, 85, 30];

const rise = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };
const pop = { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 } };

/**
 * The landing page's picture of the product: a recording goes in, a transcript
 * with speakers comes out, a person corrects it and exports it. It plays the
 * four steps in a loop; the step tabs jump to one.
 */
export function TranscriptionWalkthrough() {
  const t = useTranslations('workspaces.landing.generic.walkthrough');
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(reduceMotion ? STILL_STEP : 0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (reduceMotion) return;
    timer.current = setInterval(() => setStep((current) => (current + 1) % STEPS.length), STEP_MS);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) setStep(STILL_STEP);
    start();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduceMotion, start]);

  const speaker = (number: number) => t('unknownSpeaker', { number });

  return (
    <figure className={cn(surfaceCardClass, 'm-0 min-w-0 overflow-hidden shadow-[0_24px_48px_-24px_rgba(12,10,9,0.18)]')}>
      <div role="tablist" aria-label={t('label')} className="flex gap-1 border-b border-border bg-muted/60 p-2.5">
        {STEPS.map((key, index) => {
          const selected = index === step;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setStep(index);
                start();
              }}
              className={cn(
                'flex min-h-10 min-w-0 flex-auto items-center justify-center gap-2 rounded-full border px-2 text-[13px] font-medium transition-colors',
                selected
                  ? 'border-[hsl(var(--orange)/0.3)] bg-background text-foreground shadow-[0_2px_8px_-4px_rgba(12,10,9,0.25)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  selected ? 'bg-[hsl(var(--orange))] text-white' : 'bg-border text-muted-foreground',
                )}
                aria-hidden
              >
                {index + 1}
              </span>
              {/* The current step always shows its name; the others show it when the card is wide. */}
              <span className={cn('truncate', !selected && 'hidden xl:inline')}>{t(key)}</span>
            </button>
          );
        })}
      </div>

      <div className="relative h-[360px] p-5" aria-hidden>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              <div className="flex h-full flex-col justify-center">
                <div className="flex flex-col items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed border-stone-300 bg-muted/40 px-5 py-7">
                  <motion.div
                    initial={{ opacity: 0, y: -28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                    className="flex items-center gap-3 rounded-xl border border-foreground/15 bg-background px-4 py-3 shadow-[0_8px_20px_-12px_rgba(12,10,9,0.3)]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[hsl(var(--orange)/0.1)] text-[hsl(var(--orange-deep))]">
                      <Music2 className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">synenteuxi-02.mp3</span>
                      <span className="text-xs text-muted-foreground">42:10 · 38 MB</span>
                    </span>
                  </motion.div>
                  <div className="h-1.5 w-[70%] overflow-hidden rounded-full bg-border">
                    <motion.div
                      className="h-full rounded-full bg-[hsl(var(--orange))]"
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 2.2, delay: 0.6, ease: 'easeInOut' }}
                    />
                  </div>
                  <motion.span className="text-xs text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.8 }}>
                    {t('uploaded')}
                  </motion.span>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="flex h-full flex-col gap-4">
                <div className="flex h-11 items-center gap-1">
                  {BAR_HEIGHTS.map((height, index) => (
                    <motion.span
                      key={index}
                      className={cn('flex-1 rounded-full', index % 3 === 0 ? 'bg-[hsl(var(--orange))]' : 'bg-stone-300')}
                      style={{ height: `${height}%` }}
                      animate={{ scaleY: [0.35, 1, 0.35] }}
                      transition={{ duration: 0.8 + (index % 5) * 0.15, delay: index * 0.04, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-3 transcript-text">
                  <motion.div {...rise} transition={{ duration: 0.5, delay: 0.5 }} className="border-l-[3px] border-stone-400 py-1 pl-3">
                    <SpeakerLine name={speaker(1)} time="00:00:25" />
                    <p className="mt-1 text-[15px] leading-normal">{t('question')}</p>
                  </motion.div>
                  <motion.div {...rise} transition={{ duration: 0.5, delay: 1.4 }} className="border-l-[3px] border-[hsl(var(--accent))] py-1 pl-3">
                    <SpeakerLine name={speaker(2)} time="00:00:31" />
                    <p className="mt-1 text-[15px] leading-normal">
                      {t('answerStart')} {t('answerWrong')}{t('answerEnd')}
                    </p>
                  </motion.div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex h-full flex-col justify-center gap-3.5 transcript-text">
                <div className="rounded-r-xl border-l-[3px] border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.12)] px-3 py-2.5">
                  <span className="flex items-center gap-2 font-sans text-[13px] font-semibold">
                    <motion.span initial={{ opacity: 1 }} animate={{ opacity: 0.35 }} transition={{ delay: 0.5, duration: 0.5 }}>
                      {speaker(2)}
                    </motion.span>
                    <motion.span className="text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                      →
                    </motion.span>
                    <motion.span {...pop} transition={{ delay: 1, duration: 0.4 }} className="rounded-full border border-foreground/15 bg-background px-2 py-0.5">
                      {t('speakerName')}
                    </motion.span>
                  </span>
                  <p className="mt-2 text-base leading-relaxed">
                    {t('answerStart')}{' '}
                    <motion.span
                      className="relative inline-block text-muted-foreground"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0.35 }}
                      transition={{ delay: 2.2, duration: 0.4 }}
                    >
                      {t('answerWrong')}
                      <motion.span
                        className="absolute left-0 top-[52%] h-0.5 bg-red-700"
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ delay: 1.8, duration: 0.4 }}
                      />
                    </motion.span>{' '}
                    <motion.mark {...pop} transition={{ delay: 2.4, duration: 0.4 }} className="rounded bg-[hsl(var(--orange)/0.15)] px-1 text-foreground">
                      {t('answerRight')}
                    </motion.mark>
                    {t('answerEnd')}
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-full border border-border px-3 py-2 font-sans">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background">
                    <Play className="h-3 w-3 fill-current" />
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <motion.span
                      className="block h-full bg-[hsl(var(--orange))]"
                      initial={{ width: 0 }}
                      animate={{ width: '40%' }}
                      transition={{ duration: 3.2, ease: 'linear' }}
                    />
                  </span>
                  <span className="font-mono-roboto text-xs text-muted-foreground">00:00:31</span>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex h-full flex-wrap items-center justify-center gap-3.5">
                <ExportCard delay={0.2} kind="DOCX" name={`${t('exportTitle')}.docx`} hint={t('docxHint')} tone="bg-blue-50 text-blue-700" />
                <ExportCard delay={0.6} kind="SRT" name={`${t('exportTitle')}.srt`} hint={t('srtHint')} tone="bg-[hsl(var(--orange)/0.1)] text-[hsl(var(--orange-deep))]" />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <figcaption className="sr-only">{t('caption')}</figcaption>
    </figure>
  );
}

function SpeakerLine({ name, time }: { name: string; time: string }) {
  return (
    <span className="flex justify-between font-sans text-[13px] font-semibold">
      {name}
      <span className="font-mono-roboto text-xs font-normal text-muted-foreground">{time}</span>
    </span>
  );
}

function ExportCard({ delay, kind, name, hint, tone }: { delay: number; kind: string; name: string; hint: string; tone: string }) {
  return (
    <motion.div
      {...pop}
      transition={{ delay, duration: 0.45 }}
      className="flex w-[170px] flex-col gap-2.5 rounded-[14px] border border-foreground/15 bg-background p-4"
    >
      <span className={cn('flex h-12 w-10 items-end justify-center rounded-lg pb-1.5 text-[11px] font-extrabold', tone)}>{kind}</span>
      <span className="text-[13px] font-semibold">{name}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </motion.div>
  );
}
