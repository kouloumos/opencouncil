import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { updateElectedOrder } from '@/lib/db/roles'

export async function POST(
    request: Request,
    { params }: { params: { cityId: string } }
) {
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });

        const body = await request.json();
        const { rankings }: { rankings: Array<{ roleId: string, electedOrder: number | null }> } = body;

        if (!Array.isArray(rankings)) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        await updateElectedOrder(params.cityId, rankings);

        revalidateTag(`city:${params.cityId}:people`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating elected order:', error);

        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            if (error.message.includes('do not belong')) {
                return NextResponse.json({ error: error.message }, { status: 403 });
            }
        }

        return NextResponse.json({ error: 'Failed to update elected order' }, { status: 500 });
    }
}
