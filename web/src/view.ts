import type { LiveTrack, LyricsResult } from '../../src/shared/live';
import { formatTime } from './sync';
import type { T } from './i18n';
import { readChoice, saveChoice, themeColors, THEME_CHOICES, type ThemeChoice } from './theme';

export type Status = 'loading' | 'live' | 'paused' | 'idle' | 'inactive';

const byId = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

/** Average colour of the cover, or null when the CDN does not allow reading its pixels. */
function averageColor(img: HTMLImageElement): [number, number, number] | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    const n = data.length / 4;
    return [r / n, g / n, b / n].map(Math.round) as [number, number, number];
  } catch {
    return null;
  }
}

/** Every text goes through textContent: titles and lyrics come from other people's players. */
export function createView(t: T) {
  const stage = byId('stage');
  const lyricsBox = byId('lyrics');
  const notice = byId('notice');
  const bar = byId('bar');
  const status = byId('status');
  const cover = byId<HTMLImageElement>('cover');
  const miniCover = byId<HTMLImageElement>('mini-cover');
  const fill = byId('fill');
  const elapsed = byId('elapsed');
  const total = byId('total');
  const progress = byId('progress');
  let lines: HTMLElement[] = [];
  let currentLine = -2;
  let reconnecting = false;
  let shownStatus: Status = 'loading';

  const storage = (() => { try { return localStorage; } catch { return null; } })();
  let choice: ThemeChoice = readChoice(storage);
  let coverColor: [number, number, number] | null = null;

  const applyTheme = () => {
    const { bg, light } = themeColors(choice, coverColor);
    document.documentElement.style.setProperty('--bg', bg);
    document.documentElement.classList.toggle('light', light);
  };

  // The colour menu: hover opens it with a mouse (CSS), a tap or Enter toggles it (.open).
  const themeBox = byId('theme');
  const themeButton = byId<HTMLButtonElement>('theme-button');
  const themeMenu = byId('theme-menu');
  const labels: Record<ThemeChoice, string> = { cover: t('themeCover'), light: t('themeLight'), dark: t('themeDark') };
  themeButton.title = t('theme');
  themeButton.setAttribute('aria-label', t('theme'));
  const setOpen = (open: boolean) => {
    themeBox.classList.toggle('open', open);
    themeButton.setAttribute('aria-expanded', String(open));
  };
  const items = THEME_CHOICES.map((value) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitemradio');
    const check = document.createElement('span');
    check.className = 'check';
    check.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = labels[value];
    item.append(check, label);
    item.addEventListener('click', () => {
      choice = value;
      saveChoice(storage, value);
      renderMenu();
      applyTheme();
      setOpen(false);
      themeButton.focus();
    });
    themeMenu.append(item);
    return { value, item, check };
  });
  const renderMenu = () => {
    for (const { value, item, check } of items) {
      item.setAttribute('aria-checked', String(value === choice));
      check.textContent = value === choice ? '✓' : '';
    }
  };
  themeButton.addEventListener('click', () => setOpen(!themeBox.classList.contains('open')));
  document.addEventListener('click', (event) => { if (!themeBox.contains(event.target as Node)) setOpen(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !themeBox.classList.contains('open')) return;
    setOpen(false);
    themeButton.focus();
  });
  renderMenu();
  applyTheme();

  byId('made-with').textContent = t('madeWith');
  byId('lyrics-by').textContent = t('lyricsBy');
  document.title = t('pageTitle');

  function tint(src: string) {
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      // Deezer-like: in "cover" mode the page takes the cover's colour, text flips dark on light covers.
      coverColor = averageColor(probe);
      applyTheme();
    };
    probe.src = src;
  }

  function renderStatus() {
    const playing = shownStatus === 'live' || shownStatus === 'paused';
    stage.hidden = !playing;
    bar.hidden = !playing;
    notice.textContent = reconnecting ? t('reconnecting')
      : shownStatus === 'idle' ? t('idle')
        : shownStatus === 'inactive' ? t('inactive')
          : shownStatus === 'loading' ? t('loading') : '';
    status.hidden = !playing;
    status.className = `status ${shownStatus}`;
    status.textContent = shownStatus === 'live' ? t('live') : t('paused');
  }

  return {
    setStatus(next: Status) {
      shownStatus = next;
      renderStatus();
    },
    setReconnecting(on: boolean) {
      reconnecting = on;
      renderStatus();
    },
    setTrack(track: LiveTrack) {
      cover.src = miniCover.src = track.cover;
      cover.alt = track.album;
      byId('title').textContent = track.title;
      byId('artists').textContent = track.artists;
      document.title = `${track.title} · ${track.artists}`;
      progress.hidden = track.duration === 0;
      total.textContent = formatTime(track.duration);
      tint(track.cover);
      this.setLyrics(null);
    },
    /** null while loading the lyrics of a new track. */
    setLyrics(result: LyricsResult | null) {
      lyricsBox.replaceChildren();
      lyricsBox.classList.toggle('plain', result?.kind === 'plain');
      lines = [];
      currentLine = -2;
      if (!result) return;
      if (result.kind === 'none') {
        const p = document.createElement('p');
        p.className = 'line current';
        p.textContent = t('noLyrics');
        lyricsBox.append(p);
        return;
      }
      if (result.kind === 'plain') {
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = t('unsynced');
        lyricsBox.append(hint);
      }
      const texts = result.kind === 'synced' ? result.lines.map((l) => l.text) : result.text.split(/\r?\n/);
      for (const text of texts) {
        const p = document.createElement('p');
        p.className = 'line';
        // Each line keeps its own direction: Latin lyrics in an Arabic page, and the reverse.
        p.dir = 'auto';
        p.textContent = text.trim() || '♪';
        lyricsBox.append(p);
        lines.push(p);
      }
      lyricsBox.scrollTop = 0;
    },
    setLine(index: number) {
      if (index === currentLine || lines.length === 0 || lyricsBox.classList.contains('plain')) return;
      currentLine = index;
      lines.forEach((line, i) => {
        line.classList.toggle('current', i === index);
        line.classList.toggle('past', i < index);
      });
      lines[Math.max(0, index)]?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    setProgress(positionMs: number, durationMs: number) {
      if (durationMs <= 0) return;
      elapsed.textContent = formatTime(positionMs);
      fill.style.inlineSize = `${Math.min(100, (positionMs / durationMs) * 100)}%`;
    },
  };
}
