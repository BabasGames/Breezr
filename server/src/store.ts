import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { LiveState } from '../../src/shared/live';

export type Snapshot =
  | { status: 'live'; state: LiveState; receivedAt: number }
  | { status: 'idle' }
  | { status: 'unknown' };

interface Claim { hash: string; created: number }

const sha256 = (secret: string) => createHash('sha256').update(secret).digest();

/**
 * Who owns which id (persisted: only the SHA-256 of each secret) and what each one plays (memory only, no
 * history). An id nobody wrote to for `idleMs` reads as idle; the claim itself stays until removed.
 */
export class LiveStore {
  private claims = new Map<string, Claim>();
  private states = new Map<string, { state: LiveState; receivedAt: number }>();
  private subscribers = new Map<string, Set<(snapshot: Snapshot) => void>>();
  private readonly file: string;
  private readonly now: () => number;
  private readonly idleMs: number;
  private readonly maxIds: number;
  private writing: Promise<void> = Promise.resolve();

  constructor(opts: { file: string; now?: () => number; idleMs?: number; maxIds?: number }) {
    this.file = opts.file;
    this.now = opts.now ?? Date.now;
    this.idleMs = opts.idleMs ?? 600_000;
    this.maxIds = opts.maxIds ?? 100_000;
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf-8')) as Record<string, Claim>;
      this.claims = new Map(Object.entries(raw));
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
  }

  async put(id: string, secret: string, state: LiveState): Promise<'ok' | 'created' | 'forbidden' | 'full'> {
    const claim = this.claims.get(id);
    let result: 'ok' | 'created' = 'ok';
    if (!claim) {
      if (this.claims.size >= this.maxIds) return 'full';
      this.claims.set(id, { hash: sha256(secret).toString('hex'), created: this.now() });
      await this.persist();
      result = 'created';
    } else if (!this.owns(claim, secret)) {
      return 'forbidden';
    }
    this.states.set(id, { state, receivedAt: this.now() });
    this.notify(id);
    return result;
  }

  async remove(id: string, secret: string): Promise<'ok' | 'forbidden' | 'missing'> {
    const claim = this.claims.get(id);
    if (!claim) return 'missing';
    if (!this.owns(claim, secret)) return 'forbidden';
    this.claims.delete(id);
    this.states.delete(id);
    await this.persist();
    this.notify(id);
    return 'ok';
  }

  /** Whether `secret` owns `id`, before any write: lets callers charge rate limits to the right party. */
  check(id: string, secret: string): 'owner' | 'forbidden' | 'unclaimed' {
    const claim = this.claims.get(id);
    if (!claim) return 'unclaimed';
    return this.owns(claim, secret) ? 'owner' : 'forbidden';
  }

  get(id: string): Snapshot {
    if (!this.claims.has(id)) return { status: 'unknown' };
    const live = this.states.get(id);
    if (!live || this.now() - live.receivedAt > this.idleMs) return { status: 'idle' };
    return { status: 'live', state: live.state, receivedAt: live.receivedAt };
  }

  subscribe(id: string, fn: (snapshot: Snapshot) => void): () => void {
    let set = this.subscribers.get(id);
    if (!set) this.subscribers.set(id, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(id);
    };
  }

  private owns(claim: Claim, secret: string): boolean {
    return timingSafeEqual(Buffer.from(claim.hash, 'hex'), sha256(secret));
  }

  private notify(id: string) {
    const snapshot = this.get(id);
    for (const fn of this.subscribers.get(id) ?? []) fn(snapshot);
  }

  /** Atomic (temp file + rename) and serialized, so concurrent claims never interleave writes. */
  private persist(): Promise<void> {
    const data = JSON.stringify(Object.fromEntries(this.claims));
    this.writing = this.writing.then(async () => {
      await writeFile(`${this.file}.tmp`, data, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
    });
    return this.writing;
  }
}
