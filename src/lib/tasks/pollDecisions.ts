"use server";

import { PollDecisionsRequest, PollDecisionsResult } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { upsertDecision } from "../db/decisions";
import { withUserAuthorizedToEdit } from "../auth";

export async function requestPollDecisions(
    cityId: string,
    councilMeetingId: string,
    subjectIds?: string[]
) {
    await withUserAuthorizedToEdit({ cityId });

    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                id: councilMeetingId,
                cityId,
            },
        },
        include: {
            city: {
                select: {
                    diavgeiaUid: true,
                },
            },
            administrativeBody: {
                select: {
                    diavgeiaUnitId: true,
                },
            },
            subjects: {
                select: {
                    id: true,
                    name: true,
                    agendaItemIndex: true,
                },
                where: {
                    agendaItemIndex: { not: null },
                    ...(subjectIds && subjectIds.length > 0 && {
                        id: { in: subjectIds },
                    }),
                },
            },
        },
    });

    if (!councilMeeting) {
        throw new Error("Council meeting not found");
    }

    if (!councilMeeting.city.diavgeiaUid) {
        throw new Error("City does not have a Diavgeia UID configured");
    }

    if (councilMeeting.subjects.length === 0) {
        throw new Error("No eligible subjects to poll (subjects must have agendaItemIndex)");
    }

    const body: Omit<PollDecisionsRequest, 'callbackUrl'> = {
        meetingDate: councilMeeting.dateTime.toISOString().split('T')[0],
        diavgeiaUid: councilMeeting.city.diavgeiaUid,
        diavgeiaUnitId: councilMeeting.administrativeBody?.diavgeiaUnitId ?? undefined,
        subjects: councilMeeting.subjects.map(s => ({
            subjectId: s.id,
            name: s.name,
        })),
    };

    return startTask('pollDecisions', body, councilMeetingId, cityId);
}

export async function handlePollDecisionsResult(taskId: string, result: PollDecisionsResult) {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    for (const match of result.matches) {
        await upsertDecision({
            subjectId: match.subjectId,
            pdfUrl: match.pdfUrl,
            ada: match.ada,
            protocolNumber: match.protocolNumber,
            title: match.decisionTitle,
            issueDate: new Date(match.issueDate),
        });
    }

    console.log(`Poll decisions completed: ${result.matches.length} matched, ${result.unmatchedSubjects.length} unmatched, ${result.ambiguousSubjects.length} ambiguous`);
}
