import { NextResponse } from 'next/server';
import { getSubjectCountsByCity } from '@/lib/db/subject';
import { getRealm } from '@/lib/realm.server';

// Dynamic: totals are read live, with no per-request filters to cache against.
export const dynamic = 'force-dynamic';

// Unfiltered total subjects per city for the landing's Δήμοι tab — { cityId: count }.
// Scoped to the active realm so counts match what the map can actually show.
export async function GET() {
    try {
        const realm = await getRealm();
        const counts = await getSubjectCountsByCity(realm);
        return NextResponse.json(counts);
    } catch (error) {
        console.error('Error fetching subject counts by city:', error);
        return NextResponse.json({ error: 'Failed to fetch subject counts' }, { status: 500 });
    }
}
