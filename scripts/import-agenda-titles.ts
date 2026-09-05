/**
 * Write aligned agenda item titles onto Subject.agendaItemTitle. Step 4 of the one-time
 * backfill for #616.
 *
 * Dry run by default. --write applies, and needs --target <db host> equal to the host
 * that DATABASE_URL resolves to: the Nix shell exports DATABASE_URL from .env, so the
 * target is asserted, never assumed.
 *
 * Provenance: one TaskStatus per meeting, type `importAgendaTitles`, whose requestBody
 * keeps each subject's previous value. --rollback <taskId,...> restores those values and
 * deletes the rows. The type is NOT processAgenda: the admin version filter and the task
 * statistics filter on that type, so an import must not read as a task run.
 *
 * Usage:
 *   npx tsx scripts/import-agenda-titles.ts zografou-agenda-titles.json
 *   npx tsx scripts/import-agenda-titles.ts zografou-agenda-titles.json --skip-meetings m1,m2 --skip-subjects s1
 *   npx tsx scripts/import-agenda-titles.ts zografou-agenda-titles.json --write --target localhost
 *   npx tsx scripts/import-agenda-titles.ts --rollback <taskId>[,<taskId>...] --write --target localhost
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();
const TASK_TYPE = "importAgendaTitles";

interface AlignedTitle { subjectId: string; agendaItemTitle: string | null }
interface AlignedMeeting { meetingId: string; titles: AlignedTitle[]; error?: string }
interface TitlesFile { cityId: string; meetings: AlignedMeeting[] }
interface Provenance { source: string; subjects: { subjectId: string; previous: string | null }[] }

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(flag: string): boolean {
    return process.argv.includes(flag);
}
function list(flag: string): Set<string> {
    return new Set((arg(flag) ?? "").split(",").map(s => s.trim()).filter(Boolean));
}

async function assertTarget(write: boolean, target: string | undefined): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const host = new URL(url).hostname;
    const [{ db }] = await prisma.$queryRaw<[{ db: string }]>`select current_database() as db`;
    console.log(`database: ${db} @ ${host} ${write ? "(WRITE)" : "(dry run)"}`);
    if (write && host !== target) {
        throw new Error(`--target ${target ?? "<missing>"} does not match the resolved host ${host}; refusing to write`);
    }
}

async function rollback(taskIds: string[], write: boolean): Promise<void> {
    const tasks = await prisma.taskStatus.findMany({
        where: { id: { in: taskIds }, type: TASK_TYPE },
        select: { id: true, cityId: true, councilMeetingId: true, requestBody: true },
    });
    const missing = taskIds.filter(id => !tasks.some(t => t.id === id));
    if (missing.length > 0) throw new Error(`Not ${TASK_TYPE} tasks (refusing to touch): ${missing.join(", ")}`);

    for (const t of tasks) {
        const prov = JSON.parse(t.requestBody) as Provenance;
        console.log(`  ${t.cityId}/${t.councilMeetingId}: restore ${prov.subjects.length} subject(s) (task ${t.id})`);
        if (!write) continue;
        await prisma.$transaction(async tx => {
            for (const s of prov.subjects) {
                await tx.subject.updateMany({
                    where: { id: s.subjectId, councilMeetingId: t.councilMeetingId, cityId: t.cityId },
                    data: { agendaItemTitle: s.previous },
                });
            }
            await tx.taskStatus.delete({ where: { id: t.id } });
        });
    }
    console.log(write ? "Rolled back." : "Dry run; pass --write --target <host> to roll back.");
}

async function main() {
    const write = has("--write");
    await assertTarget(write, arg("--target"));

    const rollbackIds = arg("--rollback");
    if (rollbackIds) return rollback(rollbackIds.split(",").map(s => s.trim()).filter(Boolean), write);

    const inputFile = process.argv[2];
    if (!inputFile || inputFile.startsWith("-")) {
        console.error("Usage: npx tsx scripts/import-agenda-titles.ts <titles.json> [--skip-meetings a,b] [--skip-subjects x,y] [--overwrite] [--write --target <host>]");
        process.exit(1);
    }
    const file = JSON.parse(fs.readFileSync(inputFile, "utf8")) as TitlesFile;
    const skipMeetings = list("--skip-meetings");
    const skipSubjects = list("--skip-subjects");
    const overwrite = has("--overwrite");

    let toWrite = 0, written = 0, skipped = 0;
    const createdTaskIds: string[] = [];

    for (const m of file.meetings) {
        if (m.error || skipMeetings.has(m.meetingId)) {
            console.log(`  ${m.meetingId}: skipped (${m.error ? "align error" : "--skip-meetings"})`);
            continue;
        }
        const existing = await prisma.subject.findMany({
            where: { councilMeetingId: m.meetingId, cityId: file.cityId },
            select: { id: true, agendaItemTitle: true },
        });
        const previousById = new Map(existing.map(s => [s.id, s.agendaItemTitle]));

        const rows: { subjectId: string; previous: string | null; next: string }[] = [];
        for (const t of m.titles) {
            if (t.agendaItemTitle === null || skipSubjects.has(t.subjectId)) { skipped++; continue; }
            if (!previousById.has(t.subjectId)) {
                console.warn(`  ${m.meetingId}: subject ${t.subjectId} is not in this meeting; skipped`);
                skipped++;
                continue;
            }
            const previous = previousById.get(t.subjectId) ?? null;
            if (previous !== null && !overwrite) { skipped++; continue; }
            rows.push({ subjectId: t.subjectId, previous, next: t.agendaItemTitle });
        }
        toWrite += rows.length;
        console.log(`  ${m.meetingId}: ${rows.length} to write`);
        for (const r of rows) console.log(`      ${r.subjectId}  ${r.previous === null ? "null" : "replace"} -> ${r.next.slice(0, 100)}`);
        if (!write || rows.length === 0) continue;

        const provenance: Provenance = { source: inputFile, subjects: rows.map(r => ({ subjectId: r.subjectId, previous: r.previous })) };
        const task = await prisma.$transaction(async tx => {
            const created = await tx.taskStatus.create({
                data: {
                    type: TASK_TYPE,
                    status: "succeeded",
                    percentComplete: 100,
                    cityId: file.cityId,
                    councilMeetingId: m.meetingId,
                    requestBody: JSON.stringify(provenance),
                    responseBody: JSON.stringify({ applied: rows.map(r => ({ subjectId: r.subjectId, agendaItemTitle: r.next })) }),
                },
            });
            for (const r of rows) {
                await tx.subject.update({ where: { id: r.subjectId }, data: { agendaItemTitle: r.next } });
            }
            return created;
        });
        createdTaskIds.push(task.id);
        written += rows.length;
    }

    console.log(write
        ? `Wrote ${written} title(s), ${skipped} skipped. Rollback handles: ${createdTaskIds.join(",") || "(none)"}`
        : `Dry run: ${toWrite} title(s) would be written, ${skipped} skipped. Pass --write --target <host> to apply.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
