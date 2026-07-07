import { NextResponse } from 'next/server'
import { AdministrativeBodyType } from '@prisma/client'
import { getRealm } from '@/lib/realm.server'
import { getMapSubjects, type MapSubjectFilters } from '@/lib/db/subject'

// Filters vary per request → not cached. (A cacheable variant would key on realm + filters.)
export const dynamic = 'force-dynamic';

const isBodyType = (b: string): b is AdministrativeBodyType =>
    (Object.values(AdministrativeBodyType) as string[]).includes(b);

// Thin wrapper: parse + validate params, then delegate to the db-layer finder. The query,
// where-clause and wire type all live in src/lib/db/subject.ts (getMapSubjects / MapSubjectRow),
// shared with the server-side initial load — no inline Prisma, no `any`, no re-typed response.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const num = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
        const filters: MapSubjectFilters = {
            monthsBack: num(searchParams.get('monthsBack')),
            daysBack: num(searchParams.get('daysBack')) ?? null,
            allTime: searchParams.get('allTime') === 'true',
            topicIds: (searchParams.get('topicIds') || '').split(',').filter(Boolean),
            cityIds: (searchParams.get('cityIds') || '').split(',').filter(Boolean),
            bodyTypes: (searchParams.get('bodyType') || '').split(',').filter(isBodyType),
            dateFrom: searchParams.get('dateFrom'),
            dateTo: searchParams.get('dateTo'),
        };
        const subjects = await getMapSubjects(await getRealm(), filters);
        return NextResponse.json(subjects);
    } catch (error) {
        console.error('Error fetching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}
