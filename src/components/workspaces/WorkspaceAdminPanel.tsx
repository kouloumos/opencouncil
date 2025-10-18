'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Trash2, Mail, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Member {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface WorkspaceAdminPanelProps {
  workspaceId: string;
}

export function WorkspaceAdminPanel({ workspaceId }: WorkspaceAdminPanelProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const t = useTranslations('workspaces.members');
  const tCommon = useTranslations('workspaces.common');

  const loadMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invite`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleInvite() {
    if (!email.trim()) {
      toast({
        title: t('errors.invalidEmail'),
        description: t('errors.invalidEmail'),
        variant: 'destructive'
      });
      return;
    }

    setIsInviting(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.inviteFailed'));
      }

      toast({
        title: t('success.invited'),
        description: t('success.invitedDescription')
      });

      setEmail('');
      loadMembers();
    } catch (error) {
      console.error('Failed to invite user:', error);
      toast({
        title: tCommon('error'),
        description: error instanceof Error ? error.message : t('errors.inviteFailed'),
        variant: 'destructive'
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRemove(userId: string, userEmail: string) {
    if (!confirm(t('confirmRemove'))) {
      return;
    }

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/invite?userId=${userId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(t('errors.removeFailed'));
      }

      toast({
        title: t('success.removed'),
        description: t('success.removed')
      });

      loadMembers();
    } catch (error) {
      console.error('Failed to remove user:', error);
      toast({
        title: tCommon('error'),
        description: t('errors.removeFailed'),
        variant: 'destructive'
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Invite Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {t('inviteMember')}
          </CardTitle>
          <CardDescription>
            {t('noMembersDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                disabled={isInviting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInvite();
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleInvite} 
                disabled={isInviting || !email.trim()}
              >
                {isInviting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('inviting')}
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    {t('invite')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('title')} ({members.length})</CardTitle>
          <CardDescription>
            {t('noMembersDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('noMembers')}
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div>
                    <div className="font-medium">
                      {member.user.name || member.user.email}
                    </div>
                    {member.user.name && (
                      <div className="text-sm text-muted-foreground">
                        {member.user.email}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(member.userId, member.user.email)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

