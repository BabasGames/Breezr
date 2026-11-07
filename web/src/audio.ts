import type { LiveTrack } from '../../src/shared/live';
import { shouldSeek } from './music';

/** What the page calls on every track change and on every sync tick. */
export interface AudioSlot {
  load(track: LiveTrack): void;
  sync(positionMs: number, playing: boolean): void;
}

/** The YouTube player as the audio slot sees it (see youtube-player.ts). */
export interface VideoPlayer {
  load(videoId: string, startSec: number, play: boolean): void;
  seek(sec: number): void;
  play(): void;
  pause(): void;
  mute(): void;
  unmute(): void;
  isMuted(): boolean;
  /** null while nothing plays. */
  currentMs(): number | null;
  isPlaying(): boolean;
  destroy(): void;
}

// After a load, seek or play command the player needs a moment (buffering, an ad): no new command meanwhile.
const COMMAND_COOLDOWN_MS = 3000;

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
  // The video of the current track, once known; null while looking or when there is none.
  let videoId: string | null = null;
  // Bumped on every track change or disable: answers for an older request are dropped.
  let request = 0;
  let lastCommandAt = -Infinity;
  let muted = false;

  const command = (fn: () => void) => {
    lastCommandAt = now();
    fn();
  };

  async function start(forTrack: LiveTrack) {
    const mine = ++request;
    videoId = null;
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
      player?.pause();
      deps.onUnavailable(true);
      return;
    }
    deps.onUnavailable(false);
    videoId = answer.videoId;
    const first = { videoId: answer.videoId, startSec: position / 1000, play: playing };
    if (player) {
      command(() => player?.load(first.videoId, first.startSec, first.play));
      return;
    }
    creating ??= deps.player(first);
    const created = await creating;
    if (mine !== request || !enabled) return;
    if (player !== created) {
      player = created;
      lastCommandAt = now();
      if (muted) player.mute();
    } else {
      command(() => player?.load(first.videoId, first.startSec, first.play));
    }
  }

  return {
    load(next: LiveTrack) {
      track = next;
      if (enabled) void start(next);
    },

    sync(positionMs: number, isPlaying: boolean) {
      position = positionMs;
      playing = isPlaying;
      if (!enabled || !player || !videoId || now() - lastCommandAt < COMMAND_COOLDOWN_MS) return;
      const p = player;
      if (!isPlaying) {
        if (p.isPlaying()) command(() => p.pause());
        return;
      }
      if (!p.isPlaying()) {
        command(() => p.play());
        return;
      }
      const current = p.currentMs();
      if (current !== null && shouldSeek(current, positionMs)) command(() => p.seek(positionMs / 1000));
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
      if (!enabled || !player || !videoId || !player.isPlaying()) return null;
      return player.currentMs();
    },
  };
}

export type Audio = ReturnType<typeof createAudio>;
