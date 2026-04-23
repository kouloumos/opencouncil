import { verifyUnsubscribeToken } from '@/lib/notifications/tokens';
import { UnsubscribeConfirm } from '@/components/unsubscribe/UnsubscribeConfirm';
import prisma from '@/lib/db/prisma';
import { XCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
    searchParams: { token?: string };
}

export default async function UnsubscribePage({ searchParams }: Props) {
    const t = await getTranslations('Unsubscribe');
    const token = searchParams.token;

    const data = token ? verifyUnsubscribeToken(token) : null;

    if (!data) {
        return (
            <div className="container max-w-md py-24 flex flex-col items-center gap-4 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <h1 className="text-xl font-semibold">{t('invalidLinkTitle')}</h1>
                <p className="text-muted-foreground">
                    {t('invalidLinkDescription')}
                </p>
            </div>
        );
    }

    const [city, user, cityPreference] = await Promise.all([
        prisma.city.findUnique({
            where: { id: data.cityId },
            select: { name_municipality: true },
        }),
        prisma.user.findUnique({
            where: { id: data.userId },
            select: { email: true, allowProductUpdates: true, allowPetitionUpdates: true },
        }),
        prisma.notificationPreference.findUnique({
            where: { userId_cityId: { userId: data.userId, cityId: data.cityId } },
            select: { notifyByEmail: true, notifyByPhone: true },
        }),
    ]);

    const citySubscribed = Boolean(
        cityPreference && (cityPreference.notifyByEmail || cityPreference.notifyByPhone),
    );

    return (
        <div className="container max-w-md py-24">
            <UnsubscribeConfirm
                token={token!}
                cityName={city?.name_municipality ?? data.cityId}
                userEmail={user?.email ?? ''}
                allowProductUpdates={user?.allowProductUpdates ?? false}
                allowPetitionUpdates={user?.allowPetitionUpdates ?? false}
                citySubscribed={citySubscribed}
            />
        </div>
    );
}
