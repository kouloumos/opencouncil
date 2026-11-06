'use client';

import { Link } from '@/i18n/routing';
import type { WorkspaceActivity, WorkspaceMinimal } from '@/lib/db/workspaces';
import { ChevronRight, Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { DEFAULT_TIMEZONE, formatDayMonth } from '@/lib/formatters/time';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { badgeClass, badgeTone } from './styles';

interface WorkspaceListProps {
  workspaces: WorkspaceMinimal[];
  activity: Record<string, WorkspaceActivity>;
  locale: string;
}

/** The user's workspaces, one row each, and the form that creates another. */
export function WorkspaceList({ workspaces, activity, locale }: WorkspaceListProps) {
  const t = useTranslations('workspaces.list');

  return (
    <section className={cn(surfaceCardClass, 'overflow-hidden')}>
      {workspaces.length > 0 && (
        <ul className="divide-y divide-border">
          {workspaces.map((workspace) => {
            const { lastUploadAt, running, failed } = activity[workspace.id];
            const meta = [
              t('transcriptsCount', { count: workspace._count.transcripts }),
              t('membersCount', { count: workspace._count.administrators }),
              lastUploadAt && t('lastUpload', { date: formatDayMonth(new Date(lastUploadAt), DEFAULT_TIMEZONE, locale) }),
            ].filter(Boolean);

            return (
              <li key={workspace.id}>
                <Link
                  href={`/workspaces/${workspace.id}`}
                  className="group flex items-center gap-4 px-5 py-4 text-foreground transition-colors hover:bg-muted/40 hover:no-underline"
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      running > 0 ? 'bg-[hsl(var(--orange)/0.08)] text-[hsl(var(--orange-deep))]' : 'bg-muted text-foreground/70',
                    )}
                    aria-hidden
                  >
                    <Folder className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-medium transition-colors group-hover:text-[hsl(var(--orange-deep))]">
                      {workspace.name}
                    </span>
                    <span className="text-[13px] text-muted-foreground">{meta.join(' · ')}</span>
                  </span>
                  {running > 0 && <span className={cn(badgeClass, badgeTone.running)}>{t('runningCount', { count: running })}</span>}
                  {failed > 0 && <span className={cn(badgeClass, badgeTone.failed)}>{t('failedCount', { count: failed })}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <CreateWorkspaceForm />
    </section>
  );
}
