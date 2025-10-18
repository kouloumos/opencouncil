'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Upload, Edit, LogIn, ArrowRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function GenericLandingPage() {
  const t = useTranslations('workspaces.landing.generic');
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleButtonClick = () => {
    if (session) {
      router.push('/workspaces');
    } else {
      router.push('/sign-in?callbackUrl=' + encodeURIComponent('/workspaces'));
    }
  };

  const isLoading = status === 'loading';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Logo/Title */}
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              OpenTranscripts
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              {t('tagline')}
            </p>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{t('features.upload.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('features.upload.description')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{t('features.transcribe.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('features.transcribe.description')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Edit className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{t('features.edit.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('features.edit.description')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* CTA */}
          <div className="pt-8">
            <Button 
              size="lg" 
              onClick={handleButtonClick}
              className="gap-2"
              disabled={isLoading}
            >
              {session ? (
                <>
                  <ArrowRight className="w-5 h-5" />
                  {t('goToWorkspaces')}
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  {t('signIn')}
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              {session ? t('accessWorkspaces') : t('signInHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-6 px-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} OpenTranscripts. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

