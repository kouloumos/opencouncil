'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { WorkspaceMinimal } from '@/lib/db/workspaces';
import { 
  Folder, 
  Plus, 
  Loader2, 
  Trash2, 
  Edit, 
  Users, 
  FileText,
  ExternalLink,
  Settings
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface WorkspaceManagementProps {
  workspaces: WorkspaceMinimal[];
}

export function WorkspaceManagement({ workspaces: initialWorkspaces }: WorkspaceManagementProps) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceMinimal | null>(null);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('workspaces.admin');
  const tCommon = useTranslations('workspaces.common');

  async function handleCreate() {
    if (!newName.trim()) {
      toast({
        title: t('errors.nameRequired'),
        description: t('errors.nameRequired'),
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });

      if (!response.ok) {
        throw new Error(t('errors.createFailed'));
      }

      const workspace = await response.json();

      toast({
        title: t('success.created'),
        description: t('success.created')
      });

      // Add _count property for UI display
      const workspaceWithCount = {
        ...workspace,
        _count: {
          transcripts: 0,
          administrators: 0,
          speakers: 0
        }
      };

      setWorkspaces([workspaceWithCount, ...workspaces]);
      setNewName('');
      router.refresh();
    } catch (error) {
      console.error('Failed to create workspace:', error);
      toast({
        title: tCommon('error'),
        description: t('errors.createFailed'),
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  }

  function openEditDialog(workspace: WorkspaceMinimal) {
    setEditingWorkspace(workspace);
    setEditName(workspace.name);
    setIsEditDialogOpen(true);
  }

  async function handleUpdate() {
    if (!editingWorkspace || !editName.trim()) {
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${editingWorkspace.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName })
      });

      if (!response.ok) {
        throw new Error(t('errors.updateFailed'));
      }

      const updated = await response.json();

      toast({
        title: t('success.updated'),
        description: t('success.updated')
      });

      setWorkspaces(workspaces.map(w => 
        w.id === editingWorkspace.id ? { ...w, name: editName } : w
      ));
      setIsEditDialogOpen(false);
      setEditingWorkspace(null);
      router.refresh();
    } catch (error) {
      console.error('Failed to update workspace:', error);
      toast({
        title: tCommon('error'),
        description: t('errors.updateFailed'),
        variant: 'destructive'
      });
    }
  }

  async function handleDelete(workspace: WorkspaceMinimal) {
    if (!confirm(
      `${t('confirmDelete')}\n\n${t('confirmDeleteDescription')}`
    )) {
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(t('errors.deleteFailed'));
      }

      toast({
        title: t('success.deleted'),
        description: t('success.deleted')
      });

      setWorkspaces(workspaces.filter(w => w.id !== workspace.id));
      router.refresh();
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      toast({
        title: tCommon('error'),
        description: t('errors.deleteFailed'),
        variant: 'destructive'
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Workspace */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {t('createWorkspace')}
          </CardTitle>
          <CardDescription>
            {t('noWorkspacesDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name">{t('workspaceName')}</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('workspaceNamePlaceholder')}
                disabled={isCreating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreate();
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCreate} 
                disabled={isCreating || !newName.trim()}
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workspaces List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('title')} ({workspaces.length})</CardTitle>
          <CardDescription>
            {t('noWorkspacesDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <div className="text-center py-12">
              <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {t('noWorkspaces')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Folder className="w-5 h-5 flex-shrink-0" />
                      <h3 className="font-semibold text-lg truncate">
                        {workspace.name}
                      </h3>
                      {workspace.city && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          City Workspace
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {workspace._count?.transcripts ?? 0} transcripts
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {workspace._count?.administrators ?? 0} members
                      </span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {workspace.id}
                      </code>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <Link href={`/workspaces/${workspace.id}`}>
                        <ExternalLink className="w-4 h-4 mr-1" />
                        {t('viewWorkspace')}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <Link href={`/workspaces/${workspace.id}/admin`}>
                        <Settings className="w-4 h-4 mr-1" />
                        {t('manageMembers')}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(workspace)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(workspace)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editWorkspace')}</DialogTitle>
            <DialogDescription>
              {t('workspaceName')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('workspaceName')}</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('workspaceNamePlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingWorkspace(null);
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={!editName.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

