/**
 * Score existing subject-to-decision links against the official agenda titles.
 *
 * pollDecisions only matches subjects that carry no decision: linkedSubjects are passed
 * through as context. A subject linked to the wrong decision therefore stays wrong however
 * often the body is polled. Before the backfill there was nothing to test such a link
 * against, because the matcher and the audit would both have used the same summary name.
 * The official title is independent evidence, so a link whose decision title shares little
 * with it is a candidate to unlink and let a fresh poll decide.
 *
 * Read-only. It proposes; scripts/unlink-decisions.ts would act.
 *
 * Usage:
 *   npx tsx scripts/audit-decision-links.ts --city athens [--body "1η Δημοτική Κοινότητα"] [--threshold 0.25]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const arg = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
};

function fold(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}
const STOP = new Set("ΚΑΙ ΤΟΥ ΤΗΣ ΤΩΝ ΓΙΑ ΑΠΟ ΣΤΗΝ ΣΤΟΝ ΣΤΗ ΣΤΟ ΣΤΙΣ ΣΤΟΥΣ ΠΕΡΙ ΕΓΚΡΙΣΗ ΕΓΚΡΙΣΗΣ ΘΕΜΑ ΔΗΜΟΥ ΔΗΜΟΣ ΛΗΨΗ ΑΠΟΦΑΣΗΣ ΑΠΟΦΑΣΗ ΣΧΕΤΙΚΑ ΠΡΟΣ ΕΠΙ ΚΑΤΑ ΜΕΤΑ ΥΠΟ ΟΔΟΥ ΟΔΩΝ ΣΥΝΕΔΡΙΑΣΗ".split(" "));
function tokens(s: string): string[] {
    return fold(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 4 && !STOP.has(t));
}
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
    const cityId = arg("--city");
    if (!cityId) { console.error("Usage: --city <cityId> [--body <name>] [--threshold 0.25]"); process.exit(1); }
    const bodyFilter = arg("--body");
    const threshold = Number(arg("--threshold") ?? "0.25");

    const rows = await prisma.decision.findMany({
        where: { subject: { cityId, ...(bodyFilter ? { councilMeeting: { administrativeBody: { name: bodyFilter } } } : {}) } },
        select: {
            ada: true, title: true,
            subject: {
                select: {
                    id: true, name: true, agendaItemTitle: true, agendaItemIndex: true, councilMeetingId: true,
                    councilMeeting: { select: { administrativeBody: { select: { name: true } } } },
                },
            },
        },
    });

    // IDF over this city's decision titles, matching verify-agenda-titles.
    const df = new Map<string, number>();
    for (const r of rows) for (const t of new Set(tokens(r.title))) df.set(t, (df.get(t) ?? 0) + 1);
    const idf = new Map([...df].map(([t, n]) => [t, Math.log(rows.length / n)]));

    interface Row { body: string; meeting: string; idx: number | null; ada: string; byTitle: number; byName: number; title: string; decision: string }
    const scored: Row[] = [];
    for (const r of rows) {
        const s = r.subject;
        if (!s?.agendaItemTitle) continue;
        const byTitle = coverage(s.agendaItemTitle, r.title, idf);
        const byName = coverage(s.name, r.title, idf);
        if (byTitle === null) continue;
        scored.push({
            body: s.councilMeeting?.administrativeBody?.name ?? "(none)",
            meeting: s.councilMeetingId, idx: s.agendaItemIndex, ada: r.ada,
            byTitle, byName: byName ?? 0, title: s.agendaItemTitle, decision: r.title,
        });
    }

    const byBody = new Map<string, Row[]>();
    for (const r of scored) {
        if (!byBody.has(r.body)) byBody.set(r.body, []);
        byBody.get(r.body)!.push(r);
    }
    console.log(`${cityId}: scored ${scored.length} linked subjects that carry an official title\n`);
    console.log(`${"body".padEnd(24)}${"links".padStart(6)}${"suspect".padStart(9)}${"mean cov".padStart(10)}`);
    for (const [body, rs] of [...byBody].sort((a, b) => b[1].length - a[1].length)) {
        const suspect = rs.filter(r => r.byTitle < threshold).length;
        const mean = rs.reduce((a, r) => a + r.byTitle, 0) / rs.length;
        console.log(`${body.padEnd(24)}${String(rs.length).padStart(6)}${String(suspect).padStart(9)}${mean.toFixed(2).padStart(10)}`);
    }
    const suspects = scored.filter(r => r.byTitle < threshold).sort((a, b) => a.byTitle - b.byTitle);
    console.log(`\nsuspect links below ${threshold}: ${suspects.length} of ${scored.length}`);
    for (const r of suspects.slice(0, 12)) {
        console.log(`\n  ${r.body} ${r.meeting} #${r.idx}  cov ${r.byTitle.toFixed(2)} (name ${r.byName.toFixed(2)})  ${r.ada}`);
        console.log(`     agenda  : ${r.title.slice(0, 110)}`);
        console.log(`     decision: ${r.decision.slice(0, 110)}`);
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
