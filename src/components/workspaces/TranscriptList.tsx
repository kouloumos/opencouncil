'use client';

import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import type { TranscriptMinimal } from '@/lib/db/transcripts';
import { FileText, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { DEFAULT_TIMEZONE, formatDateStamp } from '@/lib/formatters/time';
import { transcriptState } from '@/lib/utils/transcriptState';
import { badgeClass, badgeTone } from './styles';

interface TranscriptListProps {
  transcripts: TranscriptMinimal[];
  workspaceId: string;
  canEdit: boolean;
  canDelete?: boolean;
  locale?: string;
}

export function TranscriptList({ transcripts, workspaceId, canDelete = false, locale = 'el' }: TranscriptListProps) {
  const t = useTranslations('workspaces.dashboard');
  const tCommon = useTranslations('workspaces.common');
  const router = useRouter();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(transcript: TranscriptMinimal) {
    if (!confirm(t('confirmDelete', { name: transcript.name }))) {
      return;
    }

    setDeletingId(transcript.id);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/transcripts/${transcript.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete transcript');
      }

      toast({
        title: tCommon('success'),
        description: t('deleteSuccess')
      });

      router.refresh();
    } catch (error) {
      console.error('Failed to delete transcript:', error);
      toast({
        title: tCommon('error'),
        description: t('deleteError'),
        variant: 'destructive'
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (transcripts.length === 0) {
    return (
      <div className={cn(surfaceCardClass, 'px-6 py-12 text-center')}>
        <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t('noTranscriptsDescription')}</p>
      </div>
    );
  }

  return (
    <ul className={cn(surfaceCardClass, 'overflow-hidden')}>
      {transcripts.map((transcript) => {
        const state = transcriptState(transcript.taskStatuses[0]?.status);
        const task = transcript.taskStatuses[0];
        const { day, monthYear } = formatDateStamp(transcript.createdAt, DEFAULT_TIMEZONE, locale);
        const running = state === 'running';
        return (
          <li
            key={transcript.id}
            className={cn('flex items-center gap-2 border-b border-border pr-3 last:border-b-0', running && 'bg-[hsl(var(--orange)/0.04)]')}
          >
            <Link
              href={`/workspaces/${workspaceId}/transcripts/${transcript.id}`}
              className="group flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-4 pr-2 text-foreground hover:no-underline sm:pl-5"
            >
              <span className="flex w-12 shrink-0 flex-col items-center gap-0.5 tabular-nums sm:w-14">
                <span className={cn('text-[22px] leading-none tracking-tight', running && 'text-[hsl(var(--orange))]')}>{day}</span>
                <span className="text-[9px] font-extrabold tracking-[0.14em] text-muted-foreground">{monthYear}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate text-[15px] font-medium transition-colors group-hover:text-[hsl(var(--orange))]">{transcript.name}</span>
                {running ? (
                  <span className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-border" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-[hsl(var(--orange))] transition-[width]"
                        style={{ width: `${Math.round(task?.percentComplete ?? 0)}%` }}
                      />
                    </span>
                    <span className="shrink-0">
                      {[task?.stage, task?.percentComplete != null ? `${Math.round(task.percentComplete)}%` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('segmentsCount', { count: transcript._count.speakerSegments })}
                  </span>
                )}
              </span>
              {state && (
                <span className={cn(badgeClass, badgeTone[state])}>
                  {state === 'running' ? t('transcribing') : state === 'done' ? t('ready') : t('failed')}
                </span>
              )}
            </Link>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(transcript)}
                disabled={deletingId === transcript.id}
                aria-label={t('deleteTranscript', { name: transcript.name })}
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
