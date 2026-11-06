'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fieldClass, primaryPillClass } from './styles';
import { captureEvent } from '@/lib/analytics/capture';

/** The last row of the workspace list: any signed-in user can create a workspace. */
export function CreateWorkspaceForm() {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('workspaces.list');

  async function handleCreate() {
    if (!name.trim()) {
      toast({
        title: t('errors.nameRequired'),
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create workspace');
      }

      const workspace = await response.json();
      captureEvent('workspace_created');

      // Show navigating state immediately
      setIsNavigating(true);

      toast({
        title: t('success.created'),
        description: t('success.createdDescription')
      });

      // Redirect to the new workspace
      router.push(`/workspaces/${workspace.id}`);
      router.refresh();
    } catch (error) {
      console.error('Failed to create workspace:', error);
      toast({
        title: t('errors.createFailed'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
      setIsCreating(false);
    }
  }

  if (isNavigating) {
    return (
      <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-5 py-4 text-sm first:border-t-0" role="status">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
        <span className="flex-1">{t('success.created')}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('redirecting')}
        </span>
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 border-t border-border bg-muted/40 px-5 py-4 first:border-t-0"
      onSubmit={(e) => {
        e.preventDefault();
        handleCreate();
      }}
    >
      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <Label htmlFor="workspace-name" className="text-[13px] font-medium">{t('newWorkspace')}</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('workspaceNamePlaceholder')}
          disabled={isCreating}
          className={fieldClass}
        />
      </div>
      <Button type="submit" disabled={isCreating || !name.trim()} className={primaryPillClass}>
        {isCreating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            {t('creating')}
          </>
        ) : (
          <>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {t('create')}
          </>
        )}
      </Button>
    </form>
  );
}
