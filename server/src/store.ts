import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { IDLE_MS, type LiveState } from '../../src/shared/live';

export type Snapshot =
  | { status: 'live'; state: LiveState; receivedAt: number }
  | { status: 'idle' }
  | { status: 'unknown' };

/** `deleted`: a tombstone. A removed link must never be claimable again: its URL may still be posted somewhere. */
interface Claim { hash: string; created: number; lastSeen: number; deleted?: true }

const DAY_MS = 86_400_000;
const sha256 = (secret: string) => createHash('sha256').update(secret).digest();

/**
 * Who owns which id (persisted: only the SHA-256 of each secret) and what each one plays (memory only, no
 * history). An id nobody wrote to for `idleMs` reads as idle. Claims and tombstones unused for `expiryMs`
 * are forgotten, so the id space can never fill up for good.
 */
export class LiveStore {
  private claims = new Map<string, Claim>();
  private states = new Map<string, { state: LiveState; receivedAt: number }>();
  private subscribers = new Map<string, Set<(snapshot: Snapshot) => void>>();
  private readonly file: string;
  private readonly now: () => number;
  private readonly idleMs: number;
  private readonly maxIds: number;
  private readonly expiryMs: number;
  private dirty = false;
  private writing: Promise<void> | null = null;

  constructor(opts: { file: string; now?: () => number; idleMs?: number; maxIds?: number; expiryMs?: number }) {
    this.file = opts.file;
    this.now = opts.now ?? Date.now;
    this.idleMs = opts.idleMs ?? IDLE_MS;
    this.maxIds = opts.maxIds ?? 100_000;
    this.expiryMs = opts.expiryMs ?? 90 * DAY_MS;
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf-8')) as Record<string, Claim>;
      this.claims = new Map(Object.entries(raw).map(([id, c]) => [id, { ...c, lastSeen: c.lastSeen ?? c.created }]));
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
    this.purgeExpired();
  }

  /** Whether `secret` owns `id`, before any write: lets callers charge rate limits to the right party. */
  check(id: string, secret: string): 'owner' | 'forbidden' | 'unclaimed' | 'gone' {
    const claim = this.claims.get(id);
    if (!claim) return 'unclaimed';
    if (claim.deleted) return 'gone';
    return this.owns(claim, secret) ? 'owner' : 'forbidden';
  }

  async put(id: string, secret: string, state: LiveState): Promise<'ok' | 'created' | 'forbidden' | 'full' | 'gone'> {
    let claim = this.claims.get(id);
    let result: 'ok' | 'created' = 'ok';
    if (claim?.deleted) return 'gone';
    if (!claim) {
      if (this.claims.size >= this.maxIds) this.purgeExpired();
      if (this.claims.size >= this.maxIds) return 'full';
      claim = { hash: sha256(secret).toString('hex'), created: this.now(), lastSeen: this.now() };
      this.claims.set(id, claim);
      result = 'created';
      this.states.set(id, { state, receivedAt: this.now() });
      this.notify(id);
      await this.persist();
      return result;
    }
    if (!this.owns(claim, secret)) return 'forbidden';
    // Expiry only needs day precision: save the new date at most once a day, not on every write.
    const stale = this.now() - claim.lastSeen > DAY_MS;
    claim.lastSeen = this.now();
    this.states.set(id, { state, receivedAt: this.now() });
    this.notify(id);
    if (stale) await this.persist();
    return result;
  }

  async remove(id: string, secret: string): Promise<'ok' | 'forbidden' | 'missing'> {
    const claim = this.claims.get(id);
    if (!claim || claim.deleted) return 'missing';
    if (!this.owns(claim, secret)) return 'forbidden';
    this.claims.set(id, { hash: claim.hash, created: claim.created, lastSeen: this.now(), deleted: true });
    this.states.delete(id);
    this.notify(id);
    await this.persist();
    return 'ok';
  }

  get(id: string): Snapshot {
    const claim = this.claims.get(id);
    if (!claim || claim.deleted) return { status: 'unknown' };
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

  private purgeExpired() {
    const limit = this.now() - this.expiryMs;
    let removed = false;
    for (const [id, claim] of this.claims) {
      if (claim.lastSeen < limit) {
        this.claims.delete(id);
        this.states.delete(id);
        removed = true;
      }
    }
    if (removed) this.dirty = true;
  }

  /**
   * One write at a time, built when it starts (a burst of claims costs one or two writes, not one copy of the
   * file each). A failed write is logged and retried with the next change; it never poisons later saves.
   */
  private persist(): Promise<void> {
    this.dirty = true;
    this.writing ??= (async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          const data = JSON.stringify(Object.fromEntries(this.claims));
          try {
            await writeFile(`${this.file}.tmp`, data, { mode: 0o600 });
            await rename(`${this.file}.tmp`, this.file);
          } catch (e) {
            console.error('breezr-live: could not save ids:', String(e));
            this.dirty = true;
            break;
          }
        }
      } finally {
        this.writing = null;
      }
    })();
    return this.writing;
  }
}
