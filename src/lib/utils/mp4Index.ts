/** The boxes that an MP4, QuickTime or M4A file can start with. A file that starts otherwise is not judged. */
const FIRST_BOXES = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot', 'uuid', 'styp', 'sidx', 'moof', 'meta', 'junk', 'PICT']);

/**
 * Whether an MP4, QuickTime or M4A file has its index (the `moov` box). It reads
 * only the box headers, a few reads of 16 bytes however large the file is. An
 * export that stopped before its end (a merge in LosslessCut that did not
 * finish, a camera that lost power) writes the media but no index, and no tool
 * can read the file then: the task server fails with "moov atom not found".
 *
 * Returns null when the file is not of that kind or cannot be read, so that the
 * caller lets it through: the check refuses only a file that it can read and that
 * certainly has no index.
 */
export async function mp4HasIndex(file: Blob): Promise<boolean | null> {
    try {
        const total = file.size;
        let position = 0;
        let first = true;
        while (position < total) {
            const header = new DataView(await file.slice(position, Math.min(position + 16, total)).arrayBuffer());
            if (header.byteLength < 8) return first ? null : false;
            const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
            if (first && !FIRST_BOXES.has(type)) return null;
            let size = header.getUint32(0);
            let headerSize = 8;
            if (size === 1) {
                if (header.byteLength < 16) return false;
                size = Number(header.getBigUint64(8));
                headerSize = 16;
            } else if (size === 0) {
                size = total - position;
            }
            if (!/^[\x20-\x7e]{4}$/.test(type) || size < headerSize) return false;
            if (type === 'moov') return true;
            if (position + size > total) return false;
            position += size;
            first = false;
        }
        return false;
    } catch {
        return null;
    }
}
