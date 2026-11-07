import { ID_PATTERN, isStale, lineIndexAt, positionAt, type LiveState, type LyricsResult } from '../../src/shared/live';
import { audio } from './audio';
import { loadI18n } from './i18n';
import { createClock } from './sync';
import { openLiveStream } from './stream';
import { createView } from './view';

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
      view.setViewers(null);
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
    view.setViewers(typeof message.viewers === 'number' ? message.viewers : null);
  };
  openLiveStream(`/api/live/${id}/events`, {
    message: onMessage,
    connected: () => view.setReconnecting(false),
    reconnecting: () => view.setReconnecting(true),
  });

  const frame = () => {
    // The stream stays open when Breezr goes silent (PC asleep, app closed): notice it here.
    if (live && isStale(live.receivedAt, clock.serverTime(Date.now()))) {
      live = null;
      trackId = null;
      view.setStatus('idle');
      view.setViewers(null);
    }
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
