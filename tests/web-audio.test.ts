import { describe, expect, test } from 'bun:test';
import { createAudio, type VideoPlayer } from '../web/src/audio';
import type { LiveTrack } from '../src/shared/live';

const track = (id: string, duration = 248_000): LiveTrack => ({
  id, title: `Song ${id}`, artists: 'Artist', album: 'Album', cover: 'https://e-cdns-images.dzcdn.net/a.jpg', duration,
});

/** A player that records commands; `time` is what YouTube reports as the current position. */
function fakePlayer() {
  const log: string[] = [];
  const p = {
    playing: false, muted: false, time: 0 as number | null,
    log,
    load(videoId: string, startSec: number, play: boolean) { log.push(`load ${videoId} ${startSec} ${play}`); p.playing = play; },
    seek(sec: number) { log.push(`seek ${sec}`); },
    play() { log.push('play'); p.playing = true; },
    pause() { log.push('pause'); p.playing = false; },
    mute() { p.muted = true; },
    unmute() { p.muted = false; },
    isMuted: () => p.muted,
    currentMs: () => (p.playing ? p.time : null),
    isPlaying: () => p.playing,
    destroy() { log.push('destroy'); },
  };
  return p;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(answers: Record<string, { videoId: string } | null> = { A: { videoId: 'vidA' }, B: { videoId: 'vidB' } }) {
  const clock = { now: 1_000_000 };
  const player = fakePlayer();
  const created: { videoId: string; startSec: number; play: boolean }[] = [];
  const asked: string[] = [];
  const events: string[] = [];
  const audio = createAudio({
    trackVideo: async (id) => { asked.push(id); return answers[id] ?? null; },
    player: async (first) => {
      created.push(first);
      player.playing = first.play;
      return player as VideoPlayer;
    },
    onUnavailable: (on) => events.push(`unavailable ${on}`),
    onMuted: (muted, blocked) => events.push(`muted ${muted} ${blocked}`),
    now: () => clock.now,
  });
  return { audio, player, created, asked, events, clock };
}

describe('audio slot', () => {
  test('nothing fetched while disabled', async () => {
    const { audio, asked, created } = setup();
    audio.load(track('A'));
    audio.sync(30_000, true);
    await flush();
    expect(asked).toEqual([]);
    expect(created).toEqual([]);
    expect(audio.enabled()).toBe(false);
  });

  test('enable loads the current track at the position', async () => {
    const { audio, created } = setup();
    audio.load(track('A'));
    audio.sync(30_000, true);
    audio.enable();
    await flush();
    expect(created).toEqual([{ videoId: 'vidA', startSec: 30, play: true }]);
  });

  test('stale answer is ignored', async () => {
    let releaseA: (v: { videoId: string }) => void = () => undefined;
    const created: string[] = [];
    const player = fakePlayer();
    const audio = createAudio({
      trackVideo: (id) => (id === 'A' ? new Promise((r) => { releaseA = r; }) : Promise.resolve({ videoId: 'vidB' })),
      player: async (first) => { created.push(first.videoId); return player as VideoPlayer; },
      onUnavailable: () => undefined,
      onMuted: () => undefined,
    });
    audio.load(track('A'));
    audio.enable();
    audio.load(track('B'));
    await flush();
    releaseA({ videoId: 'vidA' });
    await flush();
    expect(created).toEqual(['vidB']);
    expect(player.log.some((l) => l.includes('vidA'))).toBe(false);
  });

  test('cued while paused: starts when the owner resumes', async () => {
    const { audio, created, player, clock } = setup();
    audio.load(track('A'));
    audio.sync(5_000, false);
    audio.enable();
    await flush();
    expect(created[0].play).toBe(false);
    clock.now += 4_000;
    audio.sync(5_250, true);
    expect(player.log).toContain('play');
  });

  test('drift reseeks past 1.5 s, not before', async () => {
    const { audio, player, clock } = setup();
    audio.load(track('A'));
    audio.sync(10_000, true);
    audio.enable();
    await flush();
    clock.now += 4_000;
    player.time = 10_000;
    audio.sync(11_400, true);
    expect(player.log.filter((l) => l.startsWith('seek'))).toEqual([]);
    audio.sync(11_600, true);
    expect(player.log.filter((l) => l.startsWith('seek'))).toEqual(['seek 11.6']);
  });

  test('no video: unavailable, then the next track with one loads it', async () => {
    const { audio, events, player, clock } = setup({ A: null, B: { videoId: 'vidB' }, C: { videoId: 'vidC' } });
    audio.load(track('A'));
    audio.enable();
    await flush();
    expect(events).toContain('unavailable true');
    audio.load(track('B'));
    await flush();
    expect(events.at(-1)).toBe('unavailable false');
    clock.now += 4_000;
    audio.load(track('C'));
    await flush();
    expect(player.log.at(-1)).toMatch(/^load vidC /);
  });

  test('live radio (duration 0) never asks for a video', async () => {
    const { audio, asked, events } = setup();
    audio.load(track('A', 0));
    audio.enable();
    await flush();
    expect(asked).toEqual([]);
    expect(events).toContain('unavailable true');
  });

  test('disable pauses and stops syncing', async () => {
    const { audio, player, clock } = setup();
    audio.load(track('A'));
    audio.sync(1_000, true);
    audio.enable();
    await flush();
    audio.disable();
    expect(player.log.at(-1)).toBe('pause');
    clock.now += 4_000;
    audio.sync(2_000, true);
    expect(player.log.at(-1)).toBe('pause');
    expect(audio.timeMs()).toBeNull();
  });

  test('toggleMute flips and reports', async () => {
    const { audio, events } = setup();
    audio.load(track('A'));
    audio.enable();
    await flush();
    audio.toggleMute();
    expect(events.at(-1)).toBe('muted true false');
    audio.toggleMute();
    expect(events.at(-1)).toBe('muted false false');
  });

  test('blocked sound is reported as muted-by-the-browser; unmuting clears it', async () => {
    const { audio, events } = setup();
    audio.load(track('A'));
    audio.enable();
    await flush();
    audio.reportBlocked();
    expect(events.at(-1)).toBe('muted true true');
    audio.toggleMute();
    expect(events.at(-1)).toBe('muted false false');
  });

  test('an embedding error makes the track unavailable', async () => {
    const { audio, events } = setup();
    audio.load(track('A'));
    audio.enable();
    await flush();
    audio.reportError(150);
    expect(events.at(-1)).toBe('unavailable true');
  });

  test('timeMs is null until the video plays', async () => {
    const { audio, player } = setup();
    expect(audio.timeMs()).toBeNull();
    audio.load(track('A'));
    audio.sync(0, false);
    audio.enable();
    await flush();
    expect(audio.timeMs()).toBeNull();
    player.playing = true;
    player.time = 1234;
    expect(audio.timeMs()).toBe(1234);
  });
});
