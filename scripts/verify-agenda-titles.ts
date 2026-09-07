/**
 * Verify a completed agenda-title backfill against the database it wrote to.
 * Step 5 of the one-time backfill for #616, and the gate before running it on
 * production.
 *
 * Read-only. Hard checks fail the run (exit 1); measurements are reported.
 *
 * Usage:
 *   npx tsx scripts/verify-agenda-titles.ts --all
 *   npx tsx scripts/verify-agenda-titles.ts --city zografou --city athens
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function args(flag: string): string[] {
    const out: string[] = [];
    process.argv.forEach((a, i) => { if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1]); });
    return out;
}
const has = (flag: string) => process.argv.includes(flag);

/** Accent-free upper case, so «Ζωγράφου» and «ΖΩΓΡΑΦΟΥ» compare equal. */
function fold(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}
const STOP = new Set("ΚΑΙ ΤΟΥ ΤΗΣ ΤΩΝ ΓΙΑ ΑΠΟ ΣΤΗΝ ΣΤΟΝ ΣΤΗ ΣΤΟ ΣΤΙΣ ΣΤΟΥΣ ΠΕΡΙ ΕΓΚΡΙΣΗ ΕΓΚΡΙΣΗΣ ΘΕΜΑ ΔΗΜΟΥ ΔΗΜΟΣ ΛΗΨΗ ΑΠΟΦΑΣΗΣ ΑΠΟΦΑΣΗ ΣΧΕΤΙΚΑ ΠΡΟΣ ΕΠΙ ΚΑΤΑ ΜΕΤΑ ΥΠΟ ΟΔΟΥ ΟΔΩΝ ΣΥΝΕΔΡΙΑΣΗ".split(" "));
function tokens(s: string): string[] {
    return fold(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 4 && !STOP.has(t));
}

/** Share of the decision title's distinctive terms that `text` recovers, IDF-weighted over the city's own decision titles. */
function coverage(text: string, decisionTitle: string, idf: Map<string, number>): number | null {
    const want = [...new Set(tokens(decisionTitle))];
    const weights = want.map(t => idf.get(t) ?? Math.log(2));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const have = new Set(tokens(text));
    let hit = 0;
    want.forEach((t, i) => { if (have.has(t)) hit += weights[i]; });
    return hit / total;
}

async function main() {
    const cities = has("--all")
        ? (await prisma.city.findMany({ where: { status: "supported", diavgeiaUid: { not: null } }, select: { id: true } })).map(c => c.id)
        : args("--city");
    if (cities.length === 0) {
        console.error("Usage: npx tsx scripts/verify-agenda-titles.ts (--all | --city <id> [--city <id>])");
        process.exit(1);
    }
    const [{ db }] = await prisma.$queryRaw<[{ db: string }]>`select current_database() as db`;
    console.log(`database: ${db}\n`);

    const failures: string[] = [];
    const notes: string[] = [];
    let titled = 0, meetings = 0, withDecision = 0;
    let lenTitle = 0, lenName = 0, digitsTitle = 0, digitsName = 0;
    let covName = 0, covTitle = 0, covN = 0;

    for (const cityId of cities) {
        const rows = await prisma.subject.findMany({
            where: { cityId, councilMeeting: { subjects: { some: { agendaItemTitle: { not: null } } } } },
            select: {
                id: true, name: true, agendaItemTitle: true, agendaItemIndex: true, nonAgendaReason: true,
                councilMeetingId: true, decision: { select: { title: true } },
            },
        });
        if (rows.length === 0) continue;
        const titledRows = rows.filter(r => r.agendaItemTitle !== null);
        if (titledRows.length === 0) continue;
        meetings += new Set(titledRows.map(r => r.councilMeetingId)).size;
        titled += titledRows.length;

        // IDF over this city's decision titles, so ubiquitous words count for almost nothing.
        const decisions = await prisma.decision.findMany({ where: { subject: { cityId } }, select: { title: true } });
        const docs = decisions.map(d => new Set(tokens(d.title ?? "")));
        const idf = new Map<string, number>();
        for (const doc of docs) for (const t of doc) idf.set(t, (idf.get(t) ?? 0) + 1);
        for (const [t, n] of idf) idf.set(t, Math.log((docs.length + 1) / (n + 1)) + 1);

        for (const r of rows) {
            const t = r.agendaItemTitle;
            const where = `${cityId}/${r.councilMeetingId} #${r.agendaItemIndex ?? r.nonAgendaReason}`;
            if (t === null) {
                if (r.agendaItemIndex !== null) notes.push(`${where}: agenda subject without a title`);
                continue;
            }
            if (r.agendaItemIndex === null) failures.push(`${where}: non-agenda subject carries a title`);
            if (t.trim() === "") failures.push(`${where}: blank title`);
            if (t !== t.trim() || /\s{2,}/.test(t)) failures.push(`${where}: unnormalized whitespace`);
            if (/^\s*(\d+\s*[.)]|ΘΕΜΑ\s*\d|\d+\s*ο\s*ΘΕΜΑ)/i.test(fold(t))) failures.push(`${where}: keeps the agenda numbering prefix`);
            if (/ΕΙΣΗΓΗΤ|\{/.test(fold(t))) failures.push(`${where}: keeps a rapporteur marker`);
            // A short agenda item and its 2-6 word summary can legitimately be the same
            // words, so this reports rather than fails: no string test separates that
            // from the model echoing `name` instead of reading the document.
            if (fold(t) === fold(r.name)) notes.push(`${where}: title equals the summary name`);
            const greek = (t.match(/\p{Script=Greek}/gu) ?? []).length, latin = (t.match(/\p{Script=Latin}/gu) ?? []).length;
            if (greek + latin > 20 && latin > greek) notes.push(`${where}: title is mostly Latin script`);

            lenTitle += t.length; lenName += r.name.length;
            if (/\d/.test(t)) digitsTitle++;
            if (/\d/.test(r.name)) digitsName++;

            if (r.decision?.title) {
                const a = coverage(r.name, r.decision.title, idf), b = coverage(t, r.decision.title, idf);
                if (a !== null && b !== null) { covName += a; covTitle += b; covN++; }
                withDecision++;
            }
        }

        // Provenance: a backfilled title must be recoverable from an importAgendaTitles
        // row. A title that processAgenda wrote itself (task version 5 or later) needs
        // none — it came from the live extraction, not from the backfill.
        const tasks = await prisma.taskStatus.findMany({ where: { cityId, type: "importAgendaTitles" }, select: { requestBody: true } });
        const recorded = new Set<string>();
        for (const t of tasks) {
            const body = JSON.parse(t.requestBody) as { subjects?: { subjectId: string }[] };
            for (const s of body.subjects ?? []) recorded.add(s.subjectId);
        }
        const extracted = new Set((await prisma.taskStatus.findMany({
            where: { cityId, type: "processAgenda", status: "succeeded", version: { gte: 5 } },
            select: { councilMeetingId: true },
        })).map(t => t.councilMeetingId));
        for (const r of titledRows) {
            if (recorded.has(r.id) || extracted.has(r.councilMeetingId)) continue;
            failures.push(`${cityId}/${r.councilMeetingId} #${r.agendaItemIndex}: titled but no import provenance and no v5 extraction (cannot roll back)`);
        }
    }

    console.log(`titles ${titled} across ${meetings} meetings; ${withDecision} subjects also carry a linked decision\n`);
    console.log("Measurements");
    console.log(`  mean length          name ${(lenName / titled).toFixed(0)} chars -> title ${(lenTitle / titled).toFixed(0)} chars`);
    console.log(`  carries a number     name ${(100 * digitsName / titled).toFixed(0)}% -> title ${(100 * digitsTitle / titled).toFixed(0)}%`);
    if (covN > 0) {
        console.log(`  decision-title coverage (IDF weighted, n=${covN})`);
        console.log(`                       name ${(covName / covN).toFixed(2)} -> title ${(covTitle / covN).toFixed(2)}`);
    }
    if (notes.length) {
        console.log(`\nNotes (${notes.length})`);
        for (const n of notes.slice(0, 15)) console.log(`  ${n}`);
        if (notes.length > 15) console.log(`  ... ${notes.length - 15} more`);
    }
    if (failures.length) {
        console.log(`\nFAILED (${failures.length})`);
        for (const f of failures.slice(0, 25)) console.log(`  ${f}`);
        if (failures.length > 25) console.log(`  ... ${failures.length - 25} more`);
        process.exitCode = 1;
    } else {
        console.log("\nAll hard checks passed.");
    }
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
