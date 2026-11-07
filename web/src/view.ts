import type { LiveTrack, LyricsResult } from '../../src/shared/live';
import { formatTime } from './sync';
import { applyMarquee } from './marquee';
import type { T } from './i18n';
import { readChoice, saveChoice, themeColors, THEME_CHOICES, type ThemeChoice } from './theme';
import type { Mode } from './music';

export type Status = 'loading' | 'live' | 'paused' | 'idle' | 'inactive';

const byId = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

/** The span that carries (and scrolls) a title; created if the page markup is older than this script. */
function textSpan(box: HTMLElement): HTMLElement {
  let span = box.firstElementChild as HTMLElement | null;
  if (!span) {
    span = document.createElement('span');
    box.replaceChildren(span);
  }
  return span;
}

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
  const playState = byId('play-state');
  const viewers = byId('viewers');
  const page = document.querySelector('.page') as HTMLElement;
  const video = byId('video');
  const musicNote = byId('music-note');
  const choiceBox = byId('choice');
  const musicControls = byId('music-controls');
  const muteButton = byId<HTMLButtonElement>('mute-button');
  const videoButton = byId<HTMLButtonElement>('video-button');
  let mode: Mode = 'choice';
  // Music on: null while looking for the track's video, then whether there is one.
  let videoFound: boolean | null = null;
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
  const labels: Record<ThemeChoice, string> = { cover: t('themeCover'), 'cover-dark': t('themeCoverDark'), light: t('themeLight'), dark: t('themeDark') };
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

  // A narrower window can make a title overflow (or a wider one let it fit): measure again.
  new ResizeObserver(() => { applyMarquee(byId('title')); applyMarquee(byId('artists')); }).observe(byId('bar'));

  byId('listen-button').textContent = t('listen');
  byId('lyrics-button').textContent = t('lyricsOnly');
  musicNote.textContent = t('musicUnavailable');
  const label = (el: HTMLElement, text: string) => {
    el.setAttribute('aria-label', text);
    el.title = text;
  };

  /** Cover or video, choice or lyrics, and the controls: all from the mode and what is known of the video. */
  function renderMusic() {
    const playing = shownStatus === 'live' || shownStatus === 'paused';
    const showVideo = mode === 'music' && videoFound === true;
    choiceBox.hidden = mode !== 'choice';
    lyricsBox.hidden = mode === 'choice';
    video.hidden = !showVideo;
    cover.hidden = showVideo;
    page.classList.toggle('video-shown', showVideo);
    musicNote.hidden = !(mode === 'music' && videoFound === false);
    musicControls.hidden = !playing || mode === 'choice';
    muteButton.hidden = mode !== 'music';
    videoButton.setAttribute('aria-pressed', String(mode === 'music'));
    label(videoButton, t(mode === 'music' ? 'musicOff' : 'musicOn'));
  }

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
    playState.classList.toggle('paused', shownStatus === 'paused');
    playState.setAttribute('aria-label', shownStatus === 'paused' ? t('paused') : t('playing'));
    renderMusic();
  }

  label(muteButton, t('mute'));

  return {
    setMode(next: Mode) {
      if (next === 'music' && mode !== 'music') videoFound = null;
      mode = next;
      renderMusic();
    },
    setMusicUnavailable(on: boolean) {
      videoFound = !on;
      renderMusic();
    },
    /** `blocked`: the browser kept the sound off; the button blinks until the viewer taps it. */
    setMuted(muted: boolean, blocked: boolean) {
      muteButton.classList.toggle('muted', muted);
      muteButton.classList.toggle('blink', blocked);
      label(muteButton, blocked ? t('tapForSound') : t(muted ? 'unmute' : 'mute'));
    },
    onChoice(handlers: { listen(): void; lyricsOnly(): void; toggleVideo(): void; toggleMute(): void }) {
      byId('listen-button').addEventListener('click', handlers.listen);
      byId('lyrics-button').addEventListener('click', handlers.lyricsOnly);
      videoButton.addEventListener('click', handlers.toggleVideo);
      muteButton.addEventListener('click', handlers.toggleMute);
    },
    /** The owner's viewer count, when they chose to show it; null hides it. */
    setViewers(count: number | null) {
      viewers.hidden = count === null || (shownStatus !== 'live' && shownStatus !== 'paused');
      if (count === null) return;
      byId('viewers-count').textContent = String(count);
      viewers.setAttribute('aria-label', t('viewers').replace('{count}', String(count)));
      viewers.title = viewers.getAttribute('aria-label') ?? '';
    },
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
      const title = byId('title');
      const artists = byId('artists');
      textSpan(title).textContent = track.title;
      textSpan(artists).textContent = track.artists;
      // After layout, once the new text has a width.
      requestAnimationFrame(() => { applyMarquee(title); applyMarquee(artists); });
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
