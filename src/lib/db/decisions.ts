import prisma from './prisma';
import { Decision } from '@prisma/client';

export async function getDecisionsForMeeting(cityId: string, meetingId: string): Promise<Decision[]> {
    return prisma.decision.findMany({
        where: {
            subject: {
                cityId,
                councilMeetingId: meetingId,
            },
        },
    });
}

export interface UpsertDecisionData {
    subjectId: string;
    pdfUrl: string;
    protocolNumber?: string;
    ada?: string;
    title?: string;
    issueDate?: Date;
}

export async function upsertDecision(data: UpsertDecisionData): Promise<Decision> {
    return prisma.decision.upsert({
        where: { subjectId: data.subjectId },
        create: {
            subjectId: data.subjectId,
            pdfUrl: data.pdfUrl,
            protocolNumber: data.protocolNumber ?? null,
            ada: data.ada ?? null,
            title: data.title ?? null,
            issueDate: data.issueDate ?? null,
        },
        update: {
            pdfUrl: data.pdfUrl,
            protocolNumber: data.protocolNumber ?? null,
            ada: data.ada ?? null,
            title: data.title ?? null,
            issueDate: data.issueDate ?? null,
        },
    });
}

export async function deleteDecision(subjectId: string): Promise<void> {
    await prisma.decision.delete({
        where: { subjectId },
    });
}
