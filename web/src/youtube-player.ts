import type { PlayerState, VideoPlayer } from './audio';

// The official IFrame Player API, loaded only when a viewer asks for music.
interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds: number }): void;
  cueVideoById(o: { videoId: string; startSeconds: number }): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLIFrameElement, opts: {
    events: { onReady(): void; onStateChange(e: { data: number }): void; onError(e: { data: number }): void };
  }) => YTPlayer;
}
declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

const API_URL = 'https://www.youtube.com/iframe_api';
// Privacy-enhanced host: no YouTube cookies until the video plays.
const PLAYER_HOST = 'https://www.youtube-nocookie.com';
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
// A play asked for and still not playing after this long: the browser blocked sound.
const BLOCK_CHECK_MS = 1500;

let api: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  api ??= new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YTNamespace);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.onerror = () => {
      api = null;
      reject(new Error('YouTube API unavailable'));
    };
    document.head.append(script);
  });
  return api;
}

/**
 * The page builds the iframe itself so it carries referrerpolicy="strict-origin" from the first request:
 * YouTube refuses embeds without an origin (error 153), and the page's own no-referrer would hide it, but
 * the link id in the path must stay private. The API then attaches to that iframe.
 */
export async function loadYouTubePlayer(
  host: HTMLElement,
  first: { videoId: string; startSec: number; play: boolean },
  events: { error(code: number): void; blocked(): void },
): Promise<VideoPlayer> {
  const YT = await loadApi();
  const params = new URLSearchParams({
    enablejsapi: '1', controls: '0', disablekb: '1', playsinline: '1', rel: '0', iv_load_policy: '3', fs: '0',
    origin: location.origin, start: String(Math.floor(first.startSec)), autoplay: first.play ? '1' : '0',
  });
  const iframe = document.createElement('iframe');
  iframe.referrerPolicy = 'strict-origin';
  iframe.allow = 'autoplay; encrypted-media';
  iframe.title = 'YouTube';
  iframe.src = `${PLAYER_HOST}/embed/${encodeURIComponent(first.videoId)}?${params}`;
  host.replaceChildren(iframe);

  let state = -1;
  let wantPlay = first.play;
  let blockTimer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<VideoPlayer>((resolve) => {
    const checkBlocked = () => {
      clearTimeout(blockTimer);
      blockTimer = setTimeout(() => {
        if (!wantPlay || state === PLAYING || state === BUFFERING) return;
        // Browsers let a muted video play: go on muted and let the viewer turn sound on.
        yt.mute();
        yt.playVideo();
        events.blocked();
      }, BLOCK_CHECK_MS);
    };
    const player: VideoPlayer = {
      load(videoId, startSec, play) {
        wantPlay = play;
        if (play) {
          yt.loadVideoById({ videoId, startSeconds: startSec });
          checkBlocked();
        } else {
          yt.cueVideoById({ videoId, startSeconds: startSec });
        }
      },
      seek: (sec) => yt.seekTo(sec, true),
      play() {
        wantPlay = true;
        yt.playVideo();
        checkBlocked();
      },
      pause() {
        wantPlay = false;
        yt.pauseVideo();
      },
      mute: () => yt.mute(),
      unmute: () => yt.unMute(),
      currentMs: () => (state === PLAYING || state === PAUSED || state === BUFFERING ? Math.round(yt.getCurrentTime() * 1000) : null),
      durationMs: () => {
        const sec = yt.getDuration();
        return sec > 0 ? Math.round(sec * 1000) : null;
      },
      state: (): PlayerState => (state === PLAYING ? 'playing' : state === BUFFERING ? 'buffering' : state === PAUSED ? 'paused'
        : state === ENDED ? 'ended' : 'idle'),
      destroy() {
        clearTimeout(blockTimer);
        yt.destroy();
      },
    };
    const yt = new YT.Player(iframe, {
      events: {
        onReady() {
          if (first.play) {
            // `start` only takes whole seconds.
            yt.seekTo(first.startSec, true);
            yt.playVideo();
            checkBlocked();
          }
          resolve(player);
        },
        onStateChange: (e) => { state = e.data; },
        onError: (e) => events.error(e.data),
      },
    });
  });
}
