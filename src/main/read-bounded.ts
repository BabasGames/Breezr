import { constants, promises as fs } from 'fs';

/** Palette files are a few KiB; anything bigger is not one. */
export const MAX_SOURCE_BYTES = 262144;

export type BoundedRead = { ok: true; text: string } | { ok: false; reason: 'missing' | 'invalid' };

/**
 * Reads a small regular file, and nothing else. The path can come from the settings (and so, indirectly,
 * from scripts running in Deezer's page): a FIFO would block forever, /dev/zero would never end.
 * O_NONBLOCK keeps open() from waiting for a FIFO writer; fstat on the descriptor rejects anything
 * that is not a regular file before a single byte is read.
 */
export async function readBoundedText(path: string, maxBytes: number = MAX_SOURCE_BYTES): Promise<BoundedRead> {
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'invalid' };
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) return { ok: false, reason: 'invalid' };
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) return { ok: false, reason: 'invalid' };
    return { ok: true, text: buffer.subarray(0, bytesRead).toString('utf-8') };
  } catch {
    return { ok: false, reason: 'invalid' };
  } finally {
    await handle.close().catch(() => undefined);
  }
}
