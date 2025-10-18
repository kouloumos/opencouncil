'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceMinimal } from '@/lib/db/workspaces';
import { Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface WorkspaceListProps {
  workspaces: WorkspaceMinimal[];
}

export function WorkspaceList({ workspaces }: WorkspaceListProps) {
  const t = useTranslations('workspaces.list');

  if (workspaces.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {t('noWorkspacesDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workspaces.map((workspace) => (
        <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
          <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="w-5 h-5" />
                {workspace.name}
              </CardTitle>
              <CardDescription>
                {t('transcriptsCount', { count: workspace._count.transcripts })}
                {' · '}
                {t('membersCount', { count: workspace._count.administrators })}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

