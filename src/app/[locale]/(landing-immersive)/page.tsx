import { Metadata } from 'next';
import { LandingV2 } from '@/components/landing/v2/LandingV2';
import { buildHreflangAlternates } from '@/lib/utils/hreflang';
import { getRealm } from '@/lib/realm.server';
import { getRealmDefaultMapView } from '@/lib/realm';
import { getMapSubjects } from '@/lib/db/subject';

export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;
    return {
        alternates: await buildHreflangAlternates('', locale),
    };
}

export default async function HomePage() {
    // Resolve realm ONCE on the server, then load the initial subject set from the db layer
    // and hand it + the realm's default map view down as typed props. The client renders with
    // real data on first paint and no longer needs to know the realm (config is pre-resolved),
    // which is what fixes both the realm-blindness and the client-bootstrap-fetch problems.
    const realm = await getRealm();
    const initialSubjects = await getMapSubjects(realm, { daysBack: 14 });
    return <LandingV2 defaultView={getRealmDefaultMapView(realm)} initialSubjects={initialSubjects} />;
}
