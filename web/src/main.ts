import { ID_PATTERN, lineIndexAt, positionAt, type LiveState, type LyricsResult } from '../../src/shared/live';
import { audio } from './audio';
import { loadI18n } from './i18n';
import { createClock } from './sync';
import { createView } from './view';

type Message =
  | { status: 'live'; state: LiveState; receivedAt: number; serverNow: number }
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

  const events = new EventSource(`/api/live/${id}/events`);
  events.onopen = () => view.setReconnecting(false);
  // EventSource reconnects by itself; just say so meanwhile.
  events.onerror = () => view.setReconnecting(events.readyState !== EventSource.OPEN);
  events.onmessage = (event) => {
    view.setReconnecting(false);
    const message = JSON.parse(event.data) as Message;
    if ('serverNow' in message) clock = createClock(message.serverNow, Date.now());
    if (message.status !== 'live') {
      live = null;
      trackId = null;
      view.setStatus(message.status === 'idle' ? 'idle' : 'inactive');
      return;
    }
    live = message;
    if (message.state.track.id !== trackId) {
      trackId = message.state.track.id;
      lyrics = null;
      view.setTrack(message.state.track);
      audio.load(message.state.track);
      void loadLyrics(trackId);
    }
    view.setStatus(message.state.playing ? 'live' : 'paused');
  };

  const frame = () => {
    if (live) {
      const position = positionAt(live.state, clock.serverTime(Date.now()), live.receivedAt);
      view.setProgress(position, live.state.track.duration);
      if (lyrics?.kind === 'synced') view.setLine(lineIndexAt(lyrics.lines, position));
      audio.sync(position, live.state.playing);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();
