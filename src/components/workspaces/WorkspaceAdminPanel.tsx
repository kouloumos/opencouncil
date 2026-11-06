'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/formatters/name';
import { SettingsCard } from '@/components/profile/SettingsChrome';
import { fieldClass, primaryPillClass, secondaryPillClass } from './styles';

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
  const tSettings = useTranslations('workspaces.settings');
  const tList = useTranslations('workspaces.list');

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
    <div className="flex flex-col gap-4">
      <SettingsCard title={t('inviteMember')} description={tSettings('inviteDescription')}>
        <form
          className="flex flex-wrap items-end gap-3 px-4 pb-5 pt-4 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            handleInvite();
          }}
        >
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <Label htmlFor="email" className="text-[13px] font-medium">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              disabled={isInviting}
              className={fieldClass}
            />
          </div>
          <Button type="submit" disabled={isInviting || !email.trim()} className={primaryPillClass}>
            {isInviting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {t('inviting')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" aria-hidden />
                {t('invite')}
              </>
            )}
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard
        title={tSettings('membersList')}
        action={!isLoading && (
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            {tList('membersCount', { count: members.length })}
          </span>
        )}
      >
        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : members.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted-foreground">{t('noMembers')}</p>
        ) : (
          <ul className="mt-4 border-t border-border">
            {members.map((member) => {
              const label = member.user.name || member.user.email;
              return (
                <li key={member.id} className="flex items-center gap-3.5 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground" aria-hidden>
                    {getInitials(label)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{label}</span>
                    {member.user.name && <span className="truncate text-[13px] text-muted-foreground">{member.user.email}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => handleRemove(member.userId, member.user.email)}
                    aria-label={tSettings('removeMember', { name: label })}
                    className={cn(secondaryPillClass, 'min-h-9 px-3.5 text-[13px]')}
                  >
                    {tSettings('remove')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}

