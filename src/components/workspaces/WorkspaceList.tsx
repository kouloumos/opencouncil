'use client';

import { Link } from '@/i18n/routing';
import type { WorkspaceMinimal } from '@/lib/db/workspaces';
import { ChevronRight, Folder, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';

interface WorkspaceListProps {
  workspaces: WorkspaceMinimal[];
}

export function WorkspaceList({ workspaces }: WorkspaceListProps) {
  const t = useTranslations('workspaces.list');

  if (workspaces.length === 0) {
    return (
      <div className={cn(surfaceCardClass, 'px-6 py-12 text-center')}>
        <Folder className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t('noWorkspacesDescription')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {workspaces.map((workspace) => (
        <Link
          key={workspace.id}
          href={`/workspaces/${workspace.id}`}
          className={cn(surfaceCardClass, 'group flex flex-col overflow-hidden transition-shadow hover:no-underline hover:shadow-md')}
        >
          <span className="flex items-baseline gap-2 border-b border-border bg-muted/40 px-4 py-3 tabular-nums">
            <span className="text-2xl leading-none tracking-tight text-foreground">{workspace._count.transcripts}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
              {t('transcriptsLabel', { count: workspace._count.transcripts })}
            </span>
          </span>
          <span className="flex-1 px-4 pb-5 pt-4 text-lg font-medium leading-snug text-foreground transition-colors group-hover:text-[hsl(var(--orange))]">
            {workspace.name}
          </span>
          <span className="mx-4 flex items-center justify-between gap-2 border-t border-border pb-3.5 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {t('membersCount', { count: workspace._count.administrators })}
            </span>
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );
}
