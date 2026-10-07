import { defaultSourcePath, type ExternalPalette, type PathEnv, type SourceUpdate } from '../shared/palette';
import type { ThemeConfig } from '../shared/theme-model';
import type { SourceHandle } from './theme-source';

// No Electron import: everything platform-specific is injected (and faked in tests).

/** Identifies what a theme reads from: 'manual', 'system', or '<source>:<effective path>'. */
export function sourceKey(theme: ThemeConfig, env: PathEnv): string {
  if (!theme.enabled || theme.source === 'manual') return 'manual';
  if (theme.source === 'system') return 'system';
  return `${theme.source}:${theme.sourcePaths[theme.source] || defaultSourcePath(theme.source, env)}`;
}

export interface ThemeStateDeps {
  env: PathEnv;
  readOnce(theme: ThemeConfig): Promise<SourceUpdate>;
  watch(theme: ThemeConfig, initial: ExternalPalette | null, onUpdate: (u: SourceUpdate) => void): SourceHandle;
  apply(theme: ThemeConfig, palette: ExternalPalette | null, opts: { transition: boolean }): Promise<void>;
  notify(update: SourceUpdate & { forSource: string }): void;
  loadCache(key: string): ExternalPalette | null;
  saveCache(key: string, palette: ExternalPalette): void;
  now(): number;
}

const MANUAL: SourceUpdate = { palette: null, status: { state: 'ok' } };
/** No cross-fade right after a page (re)load: there is nothing on screen worth fading from. */
const NO_FADE_AFTER_LOAD_MS = 2000;

/**
 * The one place that knows what is on screen: the saved theme with its source's palette, or — while the
 * settings modal previews something — the draft with the palette of the source it previews. Source updates
 * never overwrite a preview of another source; they are kept for when the preview ends.
 */
export class ThemeState {
  private saved: ThemeConfig | null = null;
  private savedKey = 'manual';
  private savedUpdate: SourceUpdate = MANUAL;
  private draft: ThemeConfig | null = null;
  private previewKey: string | null = null;
  private previewUpdate: SourceUpdate | null = null;
  /** Source whose palette the modal currently has. */
  private shownKey: string | null = null;
  private handle: SourceHandle | null = null;
  private generation = 0;
  private modalOpen = false;
  private lastDocumentReady = Number.NEGATIVE_INFINITY;
  private stopped = false;

  constructor(private readonly deps: ThemeStateDeps) {}

  async start(saved: ThemeConfig): Promise<void> {
    this.saved = saved;
    await this.restartSource(null);
  }

  displayed(): { theme: ThemeConfig; palette: ExternalPalette | null } {
    const theme = this.draft ?? this.saved;
    if (!theme) throw new Error('ThemeState used before start()');
    return { theme, palette: this.paletteFor(this.keyOf(theme)) };
  }

  savedSource(): SourceUpdate & { forSource: string } {
    return { ...this.savedUpdate, forSource: this.savedKey };
  }

  setModalOpen(open: boolean): void {
    this.modalOpen = open;
    // The modal starts from the saved source's palette (it is in the snapshot).
    if (open) {
      // A fresh modal starts from the saved theme: drop any preview left by a page that died mid-preview.
      this.endPreview();
      this.shownKey = this.savedKey;
    }
  }

  documentReady(): Promise<void> {
    // A new document means the modal (and its unsaved preview) is gone, even if it never sent cancel.
    this.endPreview();
    this.modalOpen = false;
    this.shownKey = null;
    this.lastDocumentReady = this.deps.now();
    const { theme, palette } = this.displayed();
    return this.deps.apply(theme, palette, { transition: false });
  }

  async preview(draft: ThemeConfig): Promise<void> {
    this.draft = draft;
    const key = this.keyOf(draft);
    if (key !== 'manual' && key !== this.savedKey && key !== this.previewKey) {
      const update = await this.deps.readOnce(draft);
      // A newer preview (or the end of the preview) arrived while reading.
      if (this.draft !== draft || this.stopped) return;
      this.previewKey = key;
      this.previewUpdate = update;
    }
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.deps.notify({ ...this.updateFor(key), forSource: key });
    }
    await this.deps.apply(draft, this.paletteFor(key), { transition: false });
  }

  async cancel(): Promise<void> {
    this.endPreview();
    const { theme, palette } = this.displayed();
    await this.deps.apply(theme, palette, { transition: false });
  }

  async save(saved: ThemeConfig): Promise<void> {
    const previous = this.savedKey;
    const key = this.keyOf(saved);
    const previewed = key === this.previewKey ? this.previewUpdate : null;
    this.saved = saved;
    this.endPreview();
    if (key !== previous) await this.restartSource(previewed);
    const { theme, palette } = this.displayed();
    // The modal is closing: this is the moment the user sees the new colours arrive.
    await this.deps.apply(theme, palette, { transition: true });
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    this.handle?.stop();
    this.handle = null;
  }

  private keyOf(theme: ThemeConfig): string {
    return sourceKey(theme, this.deps.env);
  }

  private updateFor(key: string): SourceUpdate {
    if (key === 'manual') return MANUAL;
    if (key === this.savedKey) return this.savedUpdate;
    if (key === this.previewKey && this.previewUpdate) return this.previewUpdate;
    return { palette: null, status: { state: 'missing' } };
  }

  private paletteFor(key: string): ExternalPalette | null {
    return key === 'manual' ? null : this.updateFor(key).palette;
  }

  private endPreview(): void {
    this.draft = null;
    this.previewKey = null;
    this.previewUpdate = null;
  }

  /** Stops the old source (synchronously) and starts the saved one: cache, fresh read, then watcher. */
  private async restartSource(seed: SourceUpdate | null): Promise<void> {
    this.handle?.stop();
    this.handle = null;
    const generation = ++this.generation;
    const saved = this.saved!;
    const key = this.keyOf(saved);
    this.savedKey = key;
    if (key === 'manual') {
      this.savedUpdate = MANUAL;
      return;
    }
    let update = seed;
    if (!update) {
      const cached = this.deps.loadCache(key);
      this.savedUpdate = { palette: cached, status: { state: cached ? 'ok' : 'missing' } };
      const fresh = await this.deps.readOnce(saved);
      if (generation !== this.generation || this.stopped) return;
      update = fresh.palette ? fresh : { palette: cached, status: { ...fresh.status, ...(cached ? { kept: true } : {}) } };
    }
    this.savedUpdate = update;
    if (update.palette) this.deps.saveCache(key, update.palette);
    this.handle = this.deps.watch(saved, update.palette, (u) => this.onSourceUpdate(generation, u));
  }

  private onSourceUpdate(generation: number, update: SourceUpdate): void {
    if (generation !== this.generation || this.stopped) return;
    this.savedUpdate = update;
    if (update.palette) this.deps.saveCache(this.savedKey, update.palette);
    const { theme, palette } = this.displayed();
    // Previewing another source: keep this palette for later, leave the preview alone.
    if (this.keyOf(theme) !== this.savedKey) return;
    this.shownKey = this.savedKey;
    this.deps.notify({ ...update, forSource: this.savedKey });
    // A draft means the modal is open: never freeze it under a fade. Before the first page is ready there is
    // nothing to fade from (lastDocumentReady is -Infinity then, hence the explicit check).
    const ready = Number.isFinite(this.lastDocumentReady);
    const transition = ready && !this.modalOpen && !this.draft && this.deps.now() - this.lastDocumentReady >= NO_FADE_AFTER_LOAD_MS;
    void this.deps.apply(theme, palette, { transition });
  }
}
