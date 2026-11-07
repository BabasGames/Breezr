import type { LiveTrack } from '../../src/shared/live';

/**
 * Where playback will plug in later (official YouTube embed, video found through song.link from
 * `track.id`/`track.isrc`). The page already calls it on every track change and every frame.
 */
export interface AudioSlot {
  load(track: LiveTrack): void;
  sync(positionMs: number, playing: boolean): void;
}

export const audio: AudioSlot = {
  load: () => undefined,
  sync: () => undefined,
};
