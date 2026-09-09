/**
 * Find aligned titles that belong to a neighbouring agenda item. Review aid for the
 * one-time backfill of #616.
 *
 * The model maps each title to a subjectId. Across a run of near-identical items it can
 * slip by one position, which leaves every title plausible on its own and wrong in place.
 * A per-row overlap score cannot see this; comparing a row against its neighbours can.
 *
 * For each title we score its distinctive tokens against its own subject and against the
 * subjects one position either side. A row scoring better on a neighbour is reported.
 *
 * Scoring uses the subject's name and description together. The name alone is too short:
 * in a run of items that share a stock opening the generic tokens dominate and honest rows
 * look shifted.
 *
 * Usage:
 *   npx tsx scripts/detect-title-shift.ts <export.json> <titles.json>
 */
import fs from "fs";

const STOP = new Set(["του", "της", "των", "στην", "στον", "στο", "για", "και", "με", "από",
    "περί", "που", "τους", "τις", "στη", "στις", "κατά", "προς", "επί"]);

function tokens(text: string): Set<string> {
    return new Set(text.toLocaleLowerCase("el").normalize("NFD").replace(/[̀-ͯ]/g, "")
        .split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !STOP.has(w)));
}

function overlap(title: Set<string>, subject: Set<string>): number {
    if (title.size === 0) return 0;
    let hit = 0;
    for (const t of title) if (subject.has(t)) hit++;
    return hit / title.size;
}

interface Row { subjectId: string; agendaItemIndex: number; name: string; agendaItemTitle: string | null }

const [exportPath, titlesPath] = [process.argv[2], process.argv[3]];
if (!exportPath || !titlesPath) {
    console.error("Usage: npx tsx scripts/detect-title-shift.ts <export.json> <titles.json>");
    process.exit(1);
}
const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
const context = new Map<string, string>();
for (const m of exported.meetings) {
    for (const s of m.subjects) context.set(s.id, `${s.name} ${s.description ?? ""}`);
}
{
    const data = JSON.parse(fs.readFileSync(titlesPath, "utf8"));
    const suspects: string[] = [];
    const meetings = new Set<string>();
    for (const meeting of data.meetings) {
        const rows: Row[] = meeting.titles ?? [];
        const subj = rows.map(r => tokens(context.get(r.subjectId) ?? r.name));
        rows.forEach((r, i) => {
            if (!r.agendaItemTitle) return;
            const t = tokens(r.agendaItemTitle);
            const own = overlap(t, subj[i]);
            const prev = i > 0 ? overlap(t, subj[i - 1]) : 0;
            const next = i + 1 < rows.length ? overlap(t, subj[i + 1]) : 0;
            const best = Math.max(prev, next);
            // A neighbour must win clearly, and the row must fit its own subject poorly.
            if (best > own + 0.25 && own < 0.34) {
                meetings.add(meeting.meetingId);
                suspects.push(`    ${meeting.meetingId} #${r.agendaItemIndex}  own ${own.toFixed(2)} `
                    + `${prev > next ? "prev" : "next"} ${best.toFixed(2)}  | ${r.name.slice(0, 44)}`);
            }
        });
    }
    console.log(`${data.cityId}: ${suspects.length} suspected shifted title(s) in ${meetings.size} meeting(s)`
        + (meetings.size ? ` -> --skip-meetings ${[...meetings].join(",")}` : ""));
    suspects.forEach(s => console.log(s));
}
