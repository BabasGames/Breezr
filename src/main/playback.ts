import { runJs } from './functions';
import type { PlaybackState } from './tray-menu';

// Deezer's own player API (dzPlayer) for reading and driving playback. The "like" heart has no API:
// it goes through Deezer's mini-player button, found by its test id (absent → the tray hides the item).
const HEART = '[data-testid="miniplayer_container"] [data-testid^="add_to_favorite_button_"]';

const READ = `(() => {
  if (typeof dzPlayer === 'undefined' || !dzPlayer.getSongTitle()) return null;
  const heart = document.querySelector('${HEART}');
  const song = dzPlayer.getCurrentSong();
  return JSON.stringify({
    title: dzPlayer.getSongTitle() + (song && song.VERSION ? ' ' + song.VERSION : ''),
    artists: (song && song.ARTISTS ? song.ARTISTS.map((a) => a.ART_NAME).join(', ') : '') || dzPlayer.getArtistName() || '',
    playing: dzPlayer.isPlaying(),
    hasPrev: !!dzPlayer.getPrevSong(),
    hasNext: !!dzPlayer.getNextSong(),
    shuffle: !!dzPlayer.isShuffle(),
    repeat: [0, 1, 2].includes(dzPlayer.getRepeat()) ? dzPlayer.getRepeat() : 0,
    liked: heart ? heart.dataset.testid.endsWith('_on') : null,
  });
})()`;

export async function readPlayback(): Promise<PlaybackState | null> {
  const raw = await runJs(READ).catch(() => null);
  return typeof raw === 'string' ? (JSON.parse(raw) as PlaybackState) : null;
}

// `void`: the result is not needed, and one that cannot be cloned would make Electron 45+ reject the call.
const run = (code: string) => runJs(`void (typeof dzPlayer !== 'undefined' && (${code}))`).catch(() => undefined);

export const playbackControls = {
  previous: () => run('dzPlayer.control.prevSong()'),
  togglePause: () => run('dzPlayer.control.togglePause()'),
  next: () => run('dzPlayer.control.nextSong()'),
  setShuffle: (on: boolean) => run(`dzPlayer.control.setShuffle(${on === true})`),
  setRepeat: (mode: 0 | 1 | 2) => run(`dzPlayer.control.setRepeat(${[0, 1, 2].includes(mode) ? mode : 0})`),
  toggleLike: () => runJs(`document.querySelector('${HEART}')?.click()`).catch(() => undefined),
};
