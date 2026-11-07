import type { LiveTrack, LyricsResult } from '../../src/shared/live';
import { formatTime } from './sync';
import type { T } from './i18n';

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

const luminance = ([r, g, b]: [number, number, number]) => {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

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

  byId('made-with').textContent = t('madeWith');
  byId('lyrics-by').textContent = t('lyricsBy');
  document.title = t('pageTitle');

  function tint(src: string) {
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      const color = averageColor(probe);
      if (!color) return;
      // Deezer-like: the page takes the cover's colour, text flips dark on light covers.
      document.documentElement.style.setProperty('--bg', `rgb(${color.join(' ')})`);
      document.documentElement.classList.toggle('light', luminance(color) > 0.45);
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
