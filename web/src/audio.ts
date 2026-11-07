import type { LiveTrack } from '../../src/shared/live';
import { shouldSeek } from './music';

/** What the page calls on every track change and on every sync tick. */
export interface AudioSlot {
  load(track: LiveTrack, positionMs: number, playing: boolean): void;
  sync(positionMs: number, playing: boolean): void;
}

/** `idle`: not started or cued. */
export type PlayerState = 'playing' | 'buffering' | 'paused' | 'ended' | 'idle';

/** The YouTube player as the audio slot sees it (see youtube-player.ts). */
export interface VideoPlayer {
  load(videoId: string, startSec: number, play: boolean): void;
  seek(sec: number): void;
  play(): void;
  pause(): void;
  mute(): void;
  unmute(): void;
  /** null while nothing is loaded. */
  currentMs(): number | null;
  durationMs(): number | null;
  state(): PlayerState;
  destroy(): void;
}

// After a load, seek or play command the player needs a moment (buffering, an ad): no new command meanwhile.
const COMMAND_COOLDOWN_MS = 3000;
// Near its end the video is left to finish: playing it again would start the song over.
const END_MARGIN_MS = 500;
// A drift must show on this many ticks in a row before a seek: one late tick right after a seek is noise.
const DRIFT_TICKS = 2;

/**
 * Plays the track's YouTube video in step with the owner's playback, once the viewer turned music on.
 * Until then nothing is fetched and no YouTube code is loaded.
 */
export function createAudio(deps: {
  trackVideo(trackId: string): Promise<{ videoId: string } | null>;
  /** Creates the player with its first video (it owns its iframe from the start). */
  player(first: { videoId: string; startSec: number; play: boolean }): Promise<VideoPlayer>;
  onUnavailable(on: boolean): void;
  onMuted(muted: boolean, blocked: boolean): void;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let enabled = false;
  let track: LiveTrack | null = null;
  let position = 0;
  let playing = false;
  let player: VideoPlayer | null = null;
  let creating: Promise<VideoPlayer> | null = null;
  // The video the player was created with, until it is adopted.
  let createdWith: string | null = null;
  // The video of the current track, once known; null while looking or when there is none.
  let videoId: string | null = null;
  // The video the player holds right now.
  let loaded: string | null = null;
  // Bumped on every track change or disable: answers for an older request are dropped.
  let request = 0;
  let lastCommandAt = -Infinity;
  let driftTicks = 0;
  let muted = false;

  const command = (fn: () => void) => {
    lastCommandAt = now();
    driftTicks = 0;
    fn();
  };

  const loadCurrent = (p: VideoPlayer, id: string) => {
    command(() => p.load(id, position / 1000, playing));
    loaded = id;
  };

  async function start(forTrack: LiveTrack) {
    const mine = ++request;
    videoId = null;
    // The previous song must not go on under the next one while its video is looked up.
    player?.pause();
    if (forTrack.duration === 0) {
      deps.onUnavailable(true);
      return;
    }
    let answer: { videoId: string } | null;
    try {
      answer = await deps.trackVideo(forTrack.id);
    } catch {
      answer = null;
    }
    if (mine !== request || !enabled) return;
    if (!answer) {
      deps.onUnavailable(true);
      return;
    }
    deps.onUnavailable(false);
    videoId = answer.videoId;
    if (player) {
      loadCurrent(player, videoId);
      return;
    }
    if (!creating) {
      createdWith = videoId;
      creating = deps.player({ videoId, startSec: position / 1000, play: playing });
    }
    let created: VideoPlayer;
    try {
      created = await creating;
    } catch {
      // The YouTube script could not load (blocker, network): no music for this track, the next one retries.
      creating = null;
      if (mine === request) deps.onUnavailable(true);
      return;
    }
    // Whoever gets here first adopts the new player, so that it can always be paused or reloaded.
    if (player !== created) {
      player = created;
      loaded = createdWith;
      lastCommandAt = now();
      if (muted) player.mute();
    }
    if (!enabled) {
      player.pause();
      return;
    }
    if (mine !== request || !videoId) return;
    if (loaded !== videoId) loadCurrent(player, videoId);
  }

  return {
    load(next: LiveTrack, positionMs: number, isPlaying: boolean) {
      track = next;
      position = positionMs;
      playing = isPlaying;
      if (enabled) void start(next);
    },

    sync(positionMs: number, isPlaying: boolean) {
      position = positionMs;
      playing = isPlaying;
      if (!enabled || !player || !videoId || loaded !== videoId || now() - lastCommandAt < COMMAND_COOLDOWN_MS) return;
      const p = player;
      const state = p.state();
      if (!isPlaying) {
        driftTicks = 0;
        if (state === 'playing' || state === 'buffering') command(() => p.pause());
        return;
      }
      const duration = p.durationMs();
      const atEnd = duration !== null && duration > 0 && positionMs >= duration - END_MARGIN_MS;
      if (state === 'ended') {
        // The owner went back into the song: follow. Otherwise let the video stay finished.
        if (!atEnd) command(() => { p.seek(positionMs / 1000); p.play(); });
        return;
      }
      if (state === 'paused' || state === 'idle') {
        // The pause reached the page late, so the video stopped a little past the owner: resume from the owner's
        // position, or every pause would add to the gap (below the drift threshold, nothing else corrects it).
        if (!atEnd) command(() => { p.seek(positionMs / 1000); p.play(); });
        return;
      }
      // While buffering the reported time stands still: it says nothing about drift.
      if (state === 'buffering') {
        driftTicks = 0;
        return;
      }
      const current = p.currentMs();
      if (current === null || !shouldSeek(current, positionMs)) {
        driftTicks = 0;
        return;
      }
      if (++driftTicks >= DRIFT_TICKS) command(() => p.seek(positionMs / 1000));
    },

    enable() {
      if (enabled) return;
      enabled = true;
      if (track) void start(track);
    },

    disable() {
      enabled = false;
      request++;
      videoId = null;
      player?.pause();
    },

    enabled: () => enabled,

    toggleMute() {
      if (!player) return;
      muted = !muted;
      if (muted) player.mute();
      else player.unmute();
      deps.onMuted(muted, false);
    },

    /** The browser refused sound: the player went on muted, the viewer can turn sound on. */
    reportBlocked() {
      muted = true;
      player?.mute();
      deps.onMuted(true, true);
    },

    /** YouTube refused this video (embedding not allowed, removed…): lyrics go on without it. */
    reportError(code: number) {
      void code;
      videoId = null;
      player?.pause();
      deps.onUnavailable(true);
    },

    /** What the viewer hears, when a video plays; lyrics follow it. */
    timeMs(): number | null {
      if (!enabled || !player || !videoId || loaded !== videoId) return null;
      const state = player.state();
      return state === 'playing' || state === 'buffering' ? player.currentMs() : null;
    },
  };
}

export type Audio = ReturnType<typeof createAudio>;
