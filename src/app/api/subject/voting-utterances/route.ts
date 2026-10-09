import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { transcriptGateSelect, transcriptIsPublic } from '@/lib/db/sharing/publicContent';

export async function POST(request: NextRequest) {
    try {
        const { subjectId } = await request.json();

        if (!subjectId) {
            return NextResponse.json(
                { error: 'Subject ID is required' },
                { status: 400 }
            );
        }

        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            select: { cityId: true, councilMeetingId: true, councilMeeting: { select: { ...transcriptGateSelect, released: true } } },
        });
        if (!subject) {
            return NextResponse.json({ utterances: [] });
        }
        // A reader gets the words of a public transcript only; an editor of
        // the city also gets a draft or a closed meeting.
        const { councilMeeting } = subject;
        if ((!councilMeeting.released || !transcriptIsPublic(councilMeeting))
            && !(await isUserAuthorizedToEdit({ cityId: subject.cityId }))) {
            return NextResponse.json({ utterances: [] });
        }

        const utterances = await prisma.utterance.findMany({
            where: {
                discussionSubjectId: subjectId,
                discussionStatus: 'VOTE',
                // The gate above read the meeting of the subject: no utterance
                // of another meeting passes through it.
                speakerSegment: { cityId: subject.cityId, meetingId: subject.councilMeetingId },
            },
            select: {
                id: true,
                text: true,
                startTimestamp: true,
                endTimestamp: true,
                speakerSegment: {
                    select: {
                        id: true,
                        speakerTagId: true,
                        speakerTag: {
                            select: {
                                id: true,
                                label: true,
                                personId: true,
                                person: {
                                    select: {
                                        id: true,
                                        name: true,
                                        image: true,
                                        roles: {
                                            include: {
                                                party: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                startTimestamp: 'asc'
            }
        });

        return NextResponse.json({ utterances });
    } catch (error) {
        console.error('Error fetching voting utterances:', error);
        return NextResponse.json(
            { error: 'Failed to fetch voting utterances' },
            { status: 500 }
        );
    }
}
