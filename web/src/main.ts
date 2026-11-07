import { ID_PATTERN, isStale, lineIndexAt, positionAt, type LiveState, type LyricsResult } from '../../src/shared/live';
import { createAudio } from './audio';
import { loadI18n } from './i18n';
import { createClock } from './sync';
import { openLiveStream } from './stream';
import { createView } from './view';
import { lyricsTime, nextMode, type Mode, type ModeEvent } from './music';
import { loadYouTubePlayer } from './youtube-player';

type Message =
  | { status: 'live'; state: LiveState; receivedAt: number; serverNow: number; viewers?: number }
  | { status: 'idle'; serverNow: number }
  | { status: 'unknown' };

async function start() {
  const t = await loadI18n();
  const view = createView(t);
  const id = location.pathname.split('/').pop() ?? '';
  if (!ID_PATTERN.test(id)) {
    view.setStatus('inactive');
    return;
  }

  let live: Extract<Message, { status: 'live' }> | null = null;
  let clock = createClock(Date.now(), Date.now());
  let trackId: string | null = null;
  let lyrics: LyricsResult | null = null;

  // Only asked once the viewer turned music on. A busy or throttled server (429, 503) gets one more try a few
  // seconds later; then, as for "no key" or "no quota left", the track plays without music.
  async function trackVideo(forTrack: string, retry = true): Promise<{ videoId: string } | null> {
    try {
      const res = await fetch(`/api/live/${id}/video?track=${encodeURIComponent(forTrack)}`);
      if ((res.status === 429 || res.status === 503) && retry) {
        await new Promise((r) => setTimeout(r, 4000));
        return forTrack === trackId ? trackVideo(forTrack, false) : null;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { videoId?: unknown };
      return typeof body.videoId === 'string' ? { videoId: body.videoId } : null;
    } catch {
      return null;
    }
  }
  const audio = createAudio({
    trackVideo,
    player: (first) => loadYouTubePlayer(document.getElementById('video') as HTMLElement, first, {
      error: (code) => audio.reportError(code),
      blocked: () => audio.reportBlocked(),
    }),
    onUnavailable: (on) => view.setMusicUnavailable(on),
    onMuted: (muted, blocked) => view.setMuted(muted, blocked),
  });

  // The viewer's choice holds for the whole visit, through pauses and idle spells.
  let mode: Mode = 'choice';
  const apply = (event: ModeEvent) => {
    const next = nextMode(mode, event);
    if (next === mode) return;
    mode = next;
    view.setMode(mode);
    if (mode === 'music') audio.enable();
    else audio.disable();
  };
  view.setMode(mode);
  view.onChoice({
    listen: () => apply('listen'),
    lyricsOnly: () => apply('lyricsOnly'),
    toggleVideo: () => apply('toggleVideo'),
    toggleMute: () => audio.toggleMute(),
  });
  const silence = () => audio.disable();

  async function loadLyrics(forTrack: string) {
    let result: LyricsResult = { kind: 'none' };
    try {
      const res = await fetch(`/api/live/${id}/lyrics?track=${encodeURIComponent(forTrack)}`);
      if (res.ok) result = (await res.json()) as LyricsResult;
    } catch {
      // Shown as "no lyrics".
    }
    // A newer track may have started while this one was loading.
    if (forTrack !== trackId) return;
    lyrics = result;
    view.setLyrics(result);
  }

  const onMessage = (data: string) => {
    view.setReconnecting(false);
    const message = JSON.parse(data) as Message;
    if ('serverNow' in message) clock = createClock(message.serverNow, Date.now());
    if (message.status !== 'live') {
      live = null;
      trackId = null;
      silence();
      view.setViewers(null);
      view.setStatus(message.status === 'idle' ? 'idle' : 'inactive');
      return;
    }
    live = message;
    if (message.state.track.id !== trackId) {
      trackId = message.state.track.id;
      lyrics = null;
      view.setTrack(message.state.track);
      // The new track's own position: the slot must not start it where the previous one stopped.
      audio.load(message.state.track, positionAt(message.state, clock.serverTime(Date.now()), message.receivedAt), message.state.playing);
      void loadLyrics(trackId);
    }
    // Back from idle with music on: start again (muted if the browser no longer allows sound).
    if (mode === 'music' && !audio.enabled()) audio.enable();
    view.setStatus(message.state.playing ? 'live' : 'paused');
    view.setViewers(typeof message.viewers === 'number' ? message.viewers : null);
  };
  openLiveStream(`/api/live/${id}/events`, {
    message: onMessage,
    connected: () => view.setReconnecting(false),
    reconnecting: () => view.setReconnecting(true),
  });

  // The stream stays open when Breezr goes silent (PC asleep, app closed): notice it here. Checked from the
  // timer, which keeps running in a hidden tab, so a video does not play on alone.
  const checkStale = () => {
    if (live && isStale(live.receivedAt, clock.serverTime(Date.now()))) {
      live = null;
      trackId = null;
      silence();
      view.setStatus('idle');
      view.setViewers(null);
    }
  };
  const frame = () => {
    checkStale();
    if (live) {
      const position = lyricsTime(mode, audio.timeMs(), positionAt(live.state, clock.serverTime(Date.now()), live.receivedAt));
      view.setProgress(position, live.state.track.duration);
      if (lyrics?.kind === 'synced') view.setLine(lineIndexAt(lyrics.lines, position));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // The video is driven from a timer: animation frames stop in a hidden tab, the music does not.
  setInterval(() => {
    checkStale();
    if (live) audio.sync(positionAt(live.state, clock.serverTime(Date.now()), live.receivedAt), live.state.playing);
  }, 250);
}

void start();
