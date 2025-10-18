import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspacesForUser } from '@/lib/db/workspaces';
import { WorkspaceList } from '@/components/workspaces/WorkspaceList';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { env } from '@/env.mjs';

export default async function WorkspacesPage({
  params: { locale }
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale);
  
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/api/auth/signin');
  }

  const workspaces = await listWorkspacesForUser(user.id);
  const t = await getTranslations('workspaces.list');

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">
          {workspaces.length > 0 
            ? t('noWorkspacesDescription')
            : t('noWorkspaces')
          }
        </p>
      </div>
      
      {workspaces.length === 0 && env.NEXT_PUBLIC_APP_MODE === 'generic' ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">
                  {t('noWorkspaces')}
                </h3>
                <p className="text-muted-foreground max-w-md">
                  {t('noWorkspacesDescription')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <WorkspaceList workspaces={workspaces} />
      )}
    </div>
  );
}

