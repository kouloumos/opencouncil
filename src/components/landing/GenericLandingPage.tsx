'use client';

import { ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/error-line';
import { useEmailSignIn } from '@/components/user/useEmailSignIn';
import { primaryPillClass } from '@/components/workspaces/styles';
import { cn } from '@/lib/utils';
import { TranscriptionWalkthrough } from './TranscriptionWalkthrough';

/** Where a visitor lands after the sign-in link. */
const AFTER_SIGN_IN = '/workspaces';

export function GenericLandingPage() {
  const t = useTranslations('workspaces.landing.generic');
  const { data: session, status } = useSession();

  return (
    // The layout provides <main>. On a large monitor the hero fills the
    // screen below the header and scales up as one piece, to the header's width.
    <div className="flex w-full min-[1800px]:min-h-[calc(100svh-5rem)] min-[1800px]:items-center">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-12 px-4 py-14 sm:px-6 lg:gap-14 lg:py-20 min-[1800px]:[zoom:1.15]">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <h1 className="text-[34px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[44px]">{t('title')}</h1>
          <p className="text-[17px] leading-relaxed text-muted-foreground">{t('description')}</p>
          <div className="mt-1.5">
            {status === 'loading' ? (
              <div className="h-[62px]" />
            ) : session ? (
              <Button asChild className={cn(primaryPillClass, 'min-h-12 px-6 text-[15px]')}>
                <Link href={AFTER_SIGN_IN} className="hover:no-underline">
                  {t('goToWorkspaces')}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <LandingSignIn submitLabel={t('submit')} />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-[1_1_480px]">
          <TranscriptionWalkthrough />
        </div>
      </div>
    </div>
  );
}

/** The email sign-in of the sign-in page, as one field on the landing page. */
function LandingSignIn({ submitLabel }: { submitLabel: string }) {
  const t = useTranslations('SignIn');
  const { submit, error, isLoading, sentTo, setSentTo } = useEmailSignIn({ callbackUrl: AFTER_SIGN_IN });

  if (sentTo) {
    return (
      <div className="flex max-w-[480px] items-start gap-3 rounded-2xl border border-foreground/15 bg-background p-4" role="status">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
          <MailCheck className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold">{t('checkEmail.title')}</span>
          <span className="text-sm text-muted-foreground">
            {t.rich('checkEmail.description', {
              email: sentTo,
              strong: (chunks) => <strong className="break-words font-semibold text-foreground">{chunks}</strong>,
            })}
          </span>
          <button type="button" className="mt-1 self-start text-sm font-medium underline underline-offset-2" onClick={() => setSentTo(null)}>
            {t('checkEmail.useDifferentEmail')}
          </button>
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-[480px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-foreground/15 bg-background p-1.5 shadow-[0_12px_28px_-18px_rgba(12,10,9,0.35)] focus-within:border-foreground/40">
        <label htmlFor="landing-email" className="sr-only">{t('emailPlaceholder')}</label>
        <input
          id="landing-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          disabled={isLoading}
          className="h-12 min-w-0 flex-[1_1_200px] rounded-full bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground"
        />
        <input type="hidden" name="callbackUrl" value={AFTER_SIGN_IN} />
        <Button type="submit" disabled={isLoading} className={cn(primaryPillClass, 'min-h-12 px-6 text-[15px]')}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('loading')} /> : submitLabel}
        </Button>
      </div>
      {error && <ErrorLine>{t(error)}</ErrorLine>}
    </form>
  );
}
