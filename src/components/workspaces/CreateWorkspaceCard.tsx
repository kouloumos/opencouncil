'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
      <Card className="border-2 border-dashed">
        <CardContent className="py-12">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="relative">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <Loader2 className="w-6 h-6 absolute -bottom-1 -right-1 animate-spin text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">
                {t('success.created')}
              </h3>
              <p className="text-muted-foreground max-w-md">
                {t('redirecting')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          {t('createWorkspace')}
        </CardTitle>
        <CardDescription>
          {t('createWorkspaceDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workspace-name">{t('workspaceName')}</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workspaceNamePlaceholder')}
            disabled={isCreating}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate();
              }
            }}
          />
        </div>
        <Button 
          onClick={handleCreate} 
          disabled={isCreating || !name.trim()}
          className="w-full"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('creating')}
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              {t('create')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

