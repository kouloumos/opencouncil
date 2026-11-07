/** @jest-environment node */
import { mp4HasIndex } from '../mp4Index';

/** One box: its 32-bit size, its type, and that many bytes of content. */
function box(type: string, contentBytes: number, sizeField?: number): Uint8Array {
    const bytes = new Uint8Array(8 + contentBytes);
    new DataView(bytes.buffer).setUint32(0, sizeField ?? 8 + contentBytes);
    bytes.set(new TextEncoder().encode(type), 4);
    return bytes;
}

/** A box with a 64-bit size (size field 1). */
function largeBox(type: string, contentBytes: number): Uint8Array {
    const bytes = new Uint8Array(16 + contentBytes);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 1);
    bytes.set(new TextEncoder().encode(type), 4);
    view.setBigUint64(8, BigInt(16 + contentBytes));
    return bytes;
}

const file = (...parts: Uint8Array[]) => new Blob(parts);

/** Media-like bytes with no box structure, as an unfinished export leaves after its media. */
const noise = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 97 + 13) % 251);

describe('mp4HasIndex', () => {
    it('finds the index after the media, as most recorders write it', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('mdat', 1000), box('moov', 200)))).toBe(true);
    });

    it('finds the index before the media, as a file prepared for streaming has it', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('moov', 200), box('mdat', 1000)))).toBe(true);
    });

    it('does not judge what comes after the index', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('mdat', 1000), box('moov', 200), noise(50)))).toBe(true);
    });

    it('reads 64-bit box sizes and QuickTime boxes', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('wide', 0), largeBox('mdat', 1000), box('moov', 200)))).toBe(true);
    });

    it('refuses a file whose media is followed by data that is not an index', async () => {
        // The shape of the LosslessCut exports of November 2026: ftyp, wide, mdat, then noise.
        expect(await mp4HasIndex(file(box('ftyp', 16), box('wide', 0), box('mdat', 1000), noise(300)))).toBe(false);
    });

    it('refuses a file that ends after its media', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('mdat', 1000)))).toBe(false);
    });

    it('refuses a file whose media box runs past its end', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('mdat', 100, 5000)))).toBe(false);
    });

    it('refuses a media box that runs to the end of the file with no index before it', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('mdat', 1000, 0)))).toBe(false);
    });

    it('accepts a media box that runs to the end of the file after the index', async () => {
        expect(await mp4HasIndex(file(box('ftyp', 16), box('moov', 200), box('mdat', 1000, 0)))).toBe(true);
    });

    it('does not judge a file that is not MP4 inside, whatever its name', async () => {
        // An MPEG transport stream starts with the sync byte 0x47.
        expect(await mp4HasIndex(file(Uint8Array.from({ length: 376 }, (_, i) => (i % 188 === 0 ? 0x47 : 0))))).toBeNull();
        expect(await mp4HasIndex(file(new Uint8Array(4)))).toBeNull();
    });

    it('does not judge a file that it cannot read', async () => {
        const unreadable = { size: 100, slice: () => { throw new Error('gone'); } } as unknown as Blob;
        expect(await mp4HasIndex(unreadable)).toBeNull();
    });
});
