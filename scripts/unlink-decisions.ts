/**
 * Remove subject-to-decision links so a later poll can match them again.
 *
 * pollDecisions only matches subjects that carry no decision, so a subject linked to the
 * wrong decision keeps that link however often the body is polled. Athens community items
 * were matched on summary names that could not tell one music-hours item from the next,
 * which distributed the decisions of a meeting across the wrong subjects. The official
 * titles from #616 make the error measurable: see scripts/audit-decision-links.ts.
 *
 * It unlinks a whole meeting, not the rows that fail the address test. The error is a
 * permutation inside one meeting: subject A holds B's decision and B holds A's. Freeing
 * only the rows we can prove wrong leaves the right decision still attached to another
 * subject, where the matcher cannot reach it.
 *
 * Deleting a Decision sets DecisionCandidate.decisionId to null, which is the revert path
 * the schema intends. The candidate row itself stays.
 *
 * Only subjects that carry an official title are unlinked. Unlinking one without a title
 * offers the matcher no evidence it did not already have, so it cannot improve the result
 * and can lose a correct link. --include-untitled overrides this.
 *
 * Dry run unless --write. Every deletion is recorded on a TaskStatus so --rollback restores
 * the rows exactly, including their ids.
 *
 * Usage:
 *   npx tsx scripts/unlink-decisions.ts --city athens --body "2η Δημοτική Κοινότητα"
 *   npx tsx scripts/unlink-decisions.ts --city athens --body "2η Δημοτική Κοινότητα" --write --target production
 *   npx tsx scripts/unlink-decisions.ts --rollback <taskId>[,<taskId>...] --write --target production
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const TASK_TYPE = "unlinkAgendaDecisions";

const arg = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (flag: string) => process.argv.includes(flag);

/** Everything needed to recreate the row, ids included, so a rollback is exact. */
interface SavedDecision {
    id: string; subjectId: string; ada: string | null; protocolNumber: string | null;
    decisionNumber: string | null; meetingDate: string | null; title: string | null;
    pdfUrl: string; publishDate: string | null; excerpt: string | null; references: string | null;
    taskId: string | null; createdById: string | null; createdAt: string;
    candidateId: string | null;
}

async function assertTarget(write: boolean, target: string | undefined): Promise<void> {
    const [{ db }] = await prisma.$queryRaw<[{ db: string }]>`select current_database() as db`;
    console.log(`database: ${db} ${write ? "(WRITE)" : "(dry run)"}`);
    if (!write) return;
    if (db !== target) {
        throw new Error(`--target ${target ?? "<missing>"} does not match the connected database ${db}; refusing to write`);
    }
}

async function rollback(taskIds: string[], write: boolean): Promise<void> {
    const tasks = await prisma.taskStatus.findMany({
        where: { id: { in: taskIds }, type: TASK_TYPE },
        select: { id: true, cityId: true, councilMeetingId: true, requestBody: true },
    });
    if (tasks.length !== taskIds.length) {
        throw new Error(`found ${tasks.length} of ${taskIds.length} ${TASK_TYPE} tasks; refusing to restore a partial set`);
    }
    let restored = 0;
    for (const t of tasks) {
        const saved = JSON.parse(t.requestBody ?? "[]") as SavedDecision[];
        console.log(`  ${t.councilMeetingId}: restore ${saved.length} decision(s)`);
        if (!write) continue;
        await prisma.$transaction(async tx => {
            for (const d of saved) {
                await tx.decision.create({
                    data: {
                        id: d.id, subjectId: d.subjectId, ada: d.ada, protocolNumber: d.protocolNumber,
                        decisionNumber: d.decisionNumber, meetingDate: d.meetingDate ? new Date(d.meetingDate) : null,
                        title: d.title, pdfUrl: d.pdfUrl, publishDate: d.publishDate ? new Date(d.publishDate) : null,
                        excerpt: d.excerpt, references: d.references, taskId: d.taskId,
                        createdById: d.createdById, createdAt: new Date(d.createdAt),
                    },
                });
                if (d.candidateId) {
                    await tx.decisionCandidate.update({ where: { id: d.candidateId }, data: { decisionId: d.id } });
                }
                restored++;
            }
            await tx.taskStatus.delete({ where: { id: t.id } });
        }, { timeout: 120_000, maxWait: 30_000 });
    }
    console.log(write ? `Restored ${restored} decision(s).` : `Dry run: ${restored} decision(s) would be restored.`);
}

async function main() {
    const write = has("--write");
    const target = arg("--target");
    await assertTarget(write, target);

    const rollbackIds = arg("--rollback");
    if (rollbackIds) return rollback(rollbackIds.split(",").map(s => s.trim()).filter(Boolean), write);

    const cityId = arg("--city");
    const body = arg("--body");
    if (!cityId || !body) {
        console.error('Usage: --city <cityId> --body "<administrative body name>" [--meetings a,b] [--write --target <db>]');
        process.exit(1);
    }
    const onlyMeetings = new Set((arg("--meetings") ?? "").split(",").map(s => s.trim()).filter(Boolean));

    const includeUntitled = has("--include-untitled");
    const decisions = await prisma.decision.findMany({
        where: {
            subject: {
                cityId,
                councilMeeting: { administrativeBody: { name: body } },
                ...(onlyMeetings.size ? { councilMeetingId: { in: [...onlyMeetings] } } : {}),
                ...(includeUntitled ? {} : { agendaItemTitle: { not: null } }),
            },
        },
        select: {
            id: true, subjectId: true, ada: true, protocolNumber: true, decisionNumber: true,
            meetingDate: true, title: true, pdfUrl: true, publishDate: true, excerpt: true,
            references: true, taskId: true, createdById: true, createdAt: true,
            candidate: { select: { id: true } },
            subject: { select: { councilMeetingId: true, agendaItemIndex: true, agendaItemTitle: true } },
        },
        orderBy: [{ subject: { councilMeetingId: "asc" } }, { subject: { agendaItemIndex: "asc" } }],
    });

    const byMeeting = new Map<string, typeof decisions>();
    for (const d of decisions) {
        const m = d.subject.councilMeetingId;
        if (!byMeeting.has(m)) byMeeting.set(m, []);
        byMeeting.get(m)!.push(d);
    }

    const createdTaskIds: string[] = [];
    let removed = 0;
    for (const [meetingId, rows] of byMeeting) {
        console.log(`  ${meetingId}: unlink ${rows.length}`);
        for (const d of rows) {
            console.log(`      #${d.subject.agendaItemIndex} ${d.ada ?? "(no ada)"}  ${(d.title ?? "").slice(0, 80)}`);
        }
        if (!write) continue;

        const saved: SavedDecision[] = rows.map(d => ({
            id: d.id, subjectId: d.subjectId, ada: d.ada, protocolNumber: d.protocolNumber,
            decisionNumber: d.decisionNumber, meetingDate: d.meetingDate?.toISOString() ?? null,
            title: d.title, pdfUrl: d.pdfUrl, publishDate: d.publishDate?.toISOString() ?? null,
            excerpt: d.excerpt, references: d.references, taskId: d.taskId,
            createdById: d.createdById, createdAt: d.createdAt.toISOString(),
            candidateId: d.candidate?.id ?? null,
        }));

        const task = await prisma.$transaction(async tx => {
            const created = await tx.taskStatus.create({
                data: {
                    type: TASK_TYPE, status: "succeeded", percentComplete: 100,
                    cityId, councilMeetingId: meetingId,
                    requestBody: JSON.stringify(saved),
                    responseBody: JSON.stringify({ body, unlinked: saved.map(s => ({ subjectId: s.subjectId, ada: s.ada })) }),
                },
            });
            await tx.decision.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
            return created;
        }, { timeout: 120_000, maxWait: 30_000 });
        createdTaskIds.push(task.id);
        removed += rows.length;
    }

    console.log(write
        ? `Unlinked ${removed} decision(s) across ${createdTaskIds.length} meeting(s). Rollback handles: ${createdTaskIds.join(",") || "(none)"}`
        : `Dry run: ${decisions.length} decision(s) across ${byMeeting.size} meeting(s) would be unlinked. Pass --write --target <database name> to apply.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
