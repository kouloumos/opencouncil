/**
 * The meeting of a council task, put on the task where the handlers read it.
 * A task belongs to a transcript, and only a transcript of a council meeting
 * has a meeting: the handlers of council tasks throw for any other.
 */
export function withCouncilMeeting<T extends { id: string }, M>(
    task: T & { transcript: { councilMeeting: M | null } },
): T & { councilMeeting: M } {
    const councilMeeting = task.transcript.councilMeeting;
    if (!councilMeeting) {
        throw new Error(`Task ${task.id} does not belong to a council meeting`);
    }
    return { ...task, councilMeeting };
}
