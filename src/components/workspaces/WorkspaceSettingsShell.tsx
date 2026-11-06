import { getTranslations } from 'next-intl/server';
import { List, Users, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { SectionHeading, railRowActiveClass, railRowClass } from '@/components/profile/SettingsChrome';

type SettingsSection = 'members' | 'tasks';

const SECTIONS: Array<{ key: SettingsSection; icon: LucideIcon; path: string }> = [
  { key: 'members', icon: Users, path: 'admin' },
  { key: 'tasks', icon: List, path: 'admin/tasks' },
];

/**
 * The settings of one workspace, laid out like the profile's settings: a rail
 * of its pages and, beside it, the page's own content. Each rail entry is a
 * page of its own, so a link to either still works.
 */
export async function WorkspaceSettingsShell({
  workspaceId,
  workspaceName,
  active,
  children,
}: {
  workspaceId: string;
  workspaceName: string;
  active: SettingsSection;
  children: React.ReactNode;
}) {
  const t = await getTranslations('workspaces.settings');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 pb-16 pt-7 sm:px-6">
      <div className="flex flex-col gap-1.5">
        <nav aria-label={t('title')} className="text-[13px] text-muted-foreground">
          <Link href={`/workspaces/${workspaceId}`} className="text-muted-foreground hover:text-foreground hover:no-underline">
            {workspaceName}
          </Link>
          <span aria-hidden className="mx-2">/</span>
          <span className="text-foreground">{t(active)}</span>
        </nav>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{t('title')}</h1>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <nav aria-label={t('title')} className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-hide lg:mx-0 lg:flex-col lg:px-0">
          {SECTIONS.map(({ key, icon: Icon, path }) => {
            const current = key === active;
            return (
              <Link
                key={key}
                href={`/workspaces/${workspaceId}/${path}`}
                aria-current={current ? 'page' : undefined}
                className={cn(railRowClass, 'w-auto justify-start lg:w-full', current && railRowActiveClass)}
              >
                <Icon className={cn('h-4 w-4 shrink-0 opacity-70', current && 'text-[hsl(var(--orange-deep))] opacity-100')} aria-hidden />
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">
          <SectionHeading title={t(active)} lead={active === 'members' ? t('membersLead') : t('tasksLead')} />
          {children}
        </div>
      </div>
    </div>
  );
}
