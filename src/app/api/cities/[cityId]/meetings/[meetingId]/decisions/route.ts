import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getDecisionsForMeeting, upsertDecision, deleteDecision } from '@/lib/db/decisions';
import { z } from 'zod';

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const decisions = await getDecisionsForMeeting(params.cityId, params.meetingId);
    return NextResponse.json(decisions);
}

const upsertSchema = z.object({
    subjectId: z.string().min(1),
    pdfUrl: z.string().url(),
    protocolNumber: z.string().optional(),
    ada: z.string().optional(),
    title: z.string().optional(),
    issueDate: z.string().datetime().optional(),
});

export async function PUT(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const body = await request.json();
    const parsed = upsertSchema.parse(body);

    const decision = await upsertDecision({
        subjectId: parsed.subjectId,
        pdfUrl: parsed.pdfUrl,
        protocolNumber: parsed.protocolNumber,
        ada: parsed.ada,
        title: parsed.title,
        issueDate: parsed.issueDate ? new Date(parsed.issueDate) : undefined,
    });
    return NextResponse.json(decision);
}

export async function DELETE(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');

    if (!subjectId) {
        return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
    }

    await deleteDecision(subjectId);
    return NextResponse.json({ success: true });
}
