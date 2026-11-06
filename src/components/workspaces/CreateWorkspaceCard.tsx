'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { fieldClass, primaryPillClass } from './styles';

export function CreateWorkspaceCard() {
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

  // Show loading state while navigating
  if (isNavigating) {
    return (
      <div className={cn(surfaceCardClass, 'flex flex-col items-center gap-4 px-6 py-12 text-center')}>
        <div className="relative">
          <CheckCircle2 className="h-12 w-12 text-green-600" aria-hidden />
          <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin text-[hsl(var(--orange-deep))]" aria-hidden />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{t('success.created')}</h3>
          <p className="max-w-md text-muted-foreground">{t('redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <section className={cn(surfaceCardClass, 'overflow-hidden')}>
      <div className="px-5 pt-5">
        <h3 className="text-[15px] font-semibold leading-snug">{t('createWorkspace')}</h3>
        <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{t('createWorkspaceDescription')}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 px-5 pb-5 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
      >
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <Label htmlFor="workspace-name" className="text-[13px] font-medium">{t('workspaceName')}</Label>
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
    </section>
  );
}

