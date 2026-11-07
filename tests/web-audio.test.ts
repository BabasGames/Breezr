import { describe, expect, test } from 'bun:test';
import { createAudio, type PlayerState, type VideoPlayer } from '../web/src/audio';
import type { LiveTrack } from '../src/shared/live';

const track = (id: string, duration = 248_000): LiveTrack => ({
  id, title: `Song ${id}`, artists: 'Artist', album: 'Album', cover: 'https://e-cdns-images.dzcdn.net/a.jpg', duration,
});

/** A player that records commands; `time` is what YouTube reports as the current position. */
function fakePlayer(initial: { videoId: string; play: boolean } = { videoId: '', play: false }) {
  const log: string[] = [];
  const p = {
    st: (initial.play ? 'playing' : 'idle') as PlayerState,
    video: initial.videoId,
    time: 0,
    duration: 248_000 as number | null,
    log,
    load(videoId: string, startSec: number, play: boolean) { log.push(`load ${videoId} ${startSec} ${play}`); p.video = videoId; p.st = play ? 'playing' : 'idle'; },
    seek(sec: number) { log.push(`seek ${sec}`); },
    play() { log.push('play'); p.st = 'playing'; },
    pause() { log.push('pause'); p.st = 'paused'; },
    mute() { log.push('mute'); },
    unmute() { log.push('unmute'); },
    currentMs: () => (p.st === 'playing' || p.st === 'paused' || p.st === 'buffering' ? p.time : null),
    durationMs: () => p.duration,
    state: () => p.st,
    destroy() { log.push('destroy'); },
  };
  return p;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const COOLDOWN = 3_100;

function setup(answers: Record<string, { videoId: string } | null> = { A: { videoId: 'vidA' }, B: { videoId: 'vidB' } }) {
  const clock = { now: 1_000_000 };
  let player = fakePlayer();
  const created: { videoId: string; startSec: number; play: boolean }[] = [];
  const asked: string[] = [];
  const events: string[] = [];
  const audio = createAudio({
    trackVideo: async (id) => { asked.push(id); return answers[id] ?? null; },
    player: async (first) => {
      created.push(first);
      player = fakePlayer({ videoId: first.videoId, play: first.play });
      return player as VideoPlayer;
    },
    onUnavailable: (on) => events.push(`unavailable ${on}`),
    onMuted: (muted, blocked) => events.push(`muted ${muted} ${blocked}`),
    now: () => clock.now,
  });
  return { audio, get player() { return player; }, created, asked, events, clock };
}

describe('audio slot', () => {
  test('nothing fetched while disabled', async () => {
    const { audio, asked, created } = setup();
    audio.load(track('A'), 30_000, true);
    audio.sync(30_000, true);
    await flush();
    expect(asked).toEqual([]);
    expect(created).toEqual([]);
    expect(audio.enabled()).toBe(false);
  });

  test('enable loads the current track at the position', async () => {
    const { audio, created } = setup();
    audio.load(track('A'), 30_000, true);
    audio.enable();
    await flush();
    expect(created).toEqual([{ videoId: 'vidA', startSec: 30, play: true }]);
  });

  test('a track change starts the new video at the new position, not where the previous one was', async () => {
    const env = setup();
    env.audio.load(track('A'), 10_000, true);
    env.audio.enable();
    await flush();
    env.audio.sync(247_500, true);
    env.audio.load(track('B'), 0, true);
    await flush();
    expect(env.player.log.at(-1)).toBe('load vidB 0 true');
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
    audio.load(track('A'), 0, true);
    audio.enable();
    audio.load(track('B'), 0, true);
    await flush();
    releaseA({ videoId: 'vidA' });
    await flush();
    expect(created).toEqual(['vidB']);
    expect(player.log.some((l) => l.includes('vidA'))).toBe(false);
  });

  test('a track change while the first player is being created loads the new video into it', async () => {
    let finish: (p: VideoPlayer) => void = () => undefined;
    const player = fakePlayer({ videoId: 'vidA', play: true });
    const audio = createAudio({
      trackVideo: async (id) => ({ videoId: `vid${id}` }),
      player: () => new Promise((r) => { finish = r; }),
      onUnavailable: () => undefined,
      onMuted: () => undefined,
    });
    audio.load(track('A'), 0, true);
    audio.enable();
    await flush();
    audio.load(track('B'), 5_000, true);
    await flush();
    finish(player as VideoPlayer);
    await flush();
    expect(player.log.at(-1)).toBe('load vidB 5 true');
  });

  test('music turned off while the player is being created: the new player is paused', async () => {
    let finish: (p: VideoPlayer) => void = () => undefined;
    const player = fakePlayer({ videoId: 'vidA', play: true });
    const audio = createAudio({
      trackVideo: async (id) => ({ videoId: `vid${id}` }),
      player: () => new Promise((r) => { finish = r; }),
      onUnavailable: () => undefined,
      onMuted: () => undefined,
    });
    audio.load(track('A'), 0, true);
    audio.enable();
    await flush();
    audio.disable();
    finish(player as VideoPlayer);
    await flush();
    expect(player.st).toBe('paused');
  });

  test('cued while paused: starts when the owner resumes', async () => {
    const env = setup();
    env.audio.load(track('A'), 5_000, false);
    env.audio.enable();
    await flush();
    expect(env.created[0].play).toBe(false);
    env.clock.now += COOLDOWN;
    env.audio.sync(5_250, true);
    expect(env.player.log).toContain('play');
  });

  test('drift reseeks past 1.5 s on two ticks in a row, not on one', async () => {
    const env = setup();
    env.audio.load(track('A'), 10_000, true);
    env.audio.enable();
    await flush();
    env.clock.now += COOLDOWN;
    env.player.time = 10_000;
    env.audio.sync(11_400, true);
    env.audio.sync(11_400, true);
    expect(env.player.log.filter((l) => l.startsWith('seek'))).toEqual([]);
    env.audio.sync(11_600, true);
    expect(env.player.log.filter((l) => l.startsWith('seek'))).toEqual([]);
    env.audio.sync(11_600, true);
    expect(env.player.log.filter((l) => l.startsWith('seek'))).toEqual(['seek 11.6']);
  });

  test('no seek while the video is buffering', async () => {
    const env = setup();
    env.audio.load(track('A'), 10_000, true);
    env.audio.enable();
    await flush();
    env.clock.now += COOLDOWN;
    env.player.st = 'buffering';
    env.player.time = 5_000;
    env.audio.sync(20_000, true);
    env.audio.sync(20_000, true);
    env.audio.sync(20_000, true);
    expect(env.player.log.filter((l) => l.startsWith('seek') || l === 'play')).toEqual([]);
  });

  test('an ended video is not restarted from the beginning', async () => {
    const env = setup();
    env.audio.load(track('A'), 245_000, true);
    env.audio.enable();
    await flush();
    env.clock.now += COOLDOWN;
    env.player.duration = 245_000;
    env.player.st = 'ended';
    env.audio.sync(247_000, true);
    env.clock.now += COOLDOWN;
    env.audio.sync(247_500, true);
    expect(env.player.log.filter((l) => l === 'play' || l.startsWith('seek'))).toEqual([]);
  });

  test('ended, then the owner seeks back: the video follows', async () => {
    const env = setup();
    env.audio.load(track('A'), 240_000, true);
    env.audio.enable();
    await flush();
    env.clock.now += COOLDOWN;
    env.player.st = 'ended';
    env.audio.sync(30_000, true);
    expect(env.player.log.slice(-2)).toEqual(['seek 30', 'play']);
  });

  test('no video: unavailable, then the next track with one loads it', async () => {
    const env = setup({ A: null, B: { videoId: 'vidB' }, C: { videoId: 'vidC' } });
    env.audio.load(track('A'), 0, true);
    env.audio.enable();
    await flush();
    expect(env.events).toContain('unavailable true');
    env.audio.load(track('B'), 0, true);
    await flush();
    expect(env.events.at(-1)).toBe('unavailable false');
    env.audio.load(track('C'), 0, true);
    await flush();
    expect(env.player.log.at(-1)).toMatch(/^load vidC /);
  });

  test('live radio after a normal track pauses the previous video', async () => {
    const env = setup();
    env.audio.load(track('A'), 0, true);
    env.audio.enable();
    await flush();
    env.audio.load(track('R', 0), 0, true);
    await flush();
    expect(env.player.st).toBe('paused');
    expect(env.asked).toEqual(['A']);
    expect(env.events.at(-1)).toBe('unavailable true');
  });

  test('the previous video is paused while the next one is looked up', async () => {
    let releaseB: (v: { videoId: string }) => void = () => undefined;
    const player = fakePlayer({ videoId: 'vidA', play: true });
    const audio = createAudio({
      trackVideo: (id) => (id === 'B' ? new Promise((r) => { releaseB = r; }) : Promise.resolve({ videoId: 'vidA' })),
      player: async () => player as VideoPlayer,
      onUnavailable: () => undefined,
      onMuted: () => undefined,
    });
    audio.load(track('A'), 0, true);
    audio.enable();
    await flush();
    audio.load(track('B'), 0, true);
    expect(player.st).toBe('paused');
    releaseB({ videoId: 'vidB' });
    await flush();
    expect(player.log.at(-1)).toBe('load vidB 0 true');
  });

  test('disable pauses and stops syncing', async () => {
    const env = setup();
    env.audio.load(track('A'), 1_000, true);
    env.audio.enable();
    await flush();
    env.audio.disable();
    expect(env.player.log.at(-1)).toBe('pause');
    env.clock.now += COOLDOWN;
    env.audio.sync(2_000, true);
    expect(env.player.log.at(-1)).toBe('pause');
    expect(env.audio.timeMs()).toBeNull();
  });

  test('toggleMute flips and reports', async () => {
    const env = setup();
    env.audio.load(track('A'), 0, true);
    env.audio.enable();
    await flush();
    env.audio.toggleMute();
    expect(env.events.at(-1)).toBe('muted true false');
    env.audio.toggleMute();
    expect(env.events.at(-1)).toBe('muted false false');
  });

  test('blocked sound is reported as muted-by-the-browser; unmuting clears it', async () => {
    const env = setup();
    env.audio.load(track('A'), 0, true);
    env.audio.enable();
    await flush();
    env.audio.reportBlocked();
    expect(env.events.at(-1)).toBe('muted true true');
    env.audio.toggleMute();
    expect(env.events.at(-1)).toBe('muted false false');
  });

  test('an embedding error makes the track unavailable', async () => {
    const env = setup();
    env.audio.load(track('A'), 0, true);
    env.audio.enable();
    await flush();
    env.audio.reportError(150);
    expect(env.events.at(-1)).toBe('unavailable true');
  });

  test('a player that fails to load (blocked script) reads as unavailable, and the next track tries again', async () => {
    let attempts = 0;
    const events: string[] = [];
    const player = fakePlayer();
    const audio = createAudio({
      trackVideo: async (id) => ({ videoId: `vid${id}` }),
      player: async () => {
        attempts++;
        if (attempts === 1) throw new Error('YouTube API unavailable');
        return player as VideoPlayer;
      },
      onUnavailable: (on) => events.push(`unavailable ${on}`),
      onMuted: () => undefined,
    });
    audio.load(track('A'), 0, true);
    audio.enable();
    await flush();
    expect(events.at(-1)).toBe('unavailable true');
    audio.load(track('B'), 0, true);
    await flush();
    expect(attempts).toBe(2);
  });

  test('timeMs is null until the video plays', async () => {
    const env = setup();
    expect(env.audio.timeMs()).toBeNull();
    env.audio.load(track('A'), 0, false);
    env.audio.enable();
    await flush();
    expect(env.audio.timeMs()).toBeNull();
    env.player.st = 'playing';
    env.player.time = 1234;
    expect(env.audio.timeMs()).toBe(1234);
  });
});
