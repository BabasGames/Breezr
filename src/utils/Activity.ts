import * as Config from './Config';
import { tray } from './Tray';
import { version } from '../../package.json';
import { ActivityType } from 'discord-api-types/v10';

export async function setActivity(options: {
  client: import('@xhayper/discord-rpc').Client, albumId: number, trackId: string, playing: boolean, timeLeft: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trackTitle: string, trackArtists: any, albumCover: string, albumTitle: string, app: Electron.App, type: string,
  songTime: number
}) {
  const {
    timeLeft, playing, client, albumTitle, trackArtists, trackTitle,
    albumCover, app, type, trackId, songTime
  } = options;
  const tooltipText = await Config.get(app, 'tooltip_text');
  const statusName = await Config.get(app, 'status_name');
  switch (tooltipText) {
    case 'app_name':
      tray.setToolTip('Deezer Discord RPC');
      break;
    case 'app_version':
      tray.setToolTip(`Version ${version}`);
      break;
    case 'app_name_and_version':
      tray.setToolTip(`Deezer Discord RPC version ${version}`);
      break;
    case 'artists_and_title':
      tray.setToolTip(`${trackArtists} - ${trackTitle}`);
      break;
    case 'title_and_artists':
      tray.setToolTip(`${trackTitle} - ${trackArtists}`);
      break;
  }
  if (!client) return;

  if (!playing)
    return await client.user.clearActivity();

  const getTrackLink = () => {
    switch (type) {
      case 'song':
        return `https://www.deezer.com/track/${trackId}`;
      case 'episode':
        return `https://www.deezer.com/episode/${trackId}`;
    }
  };

  const getStatusDisplayType = () => {
    switch (statusName) {
      case 'song_title':
      case 'artists_and_title':
      case 'title_and_artists':
        return 2;
      case 'artists_song':
        return 1;
      default:
        return 0;
    }
  };

  const getActivityDetails = () => {
    switch (statusName) {
      case 'artists_and_title':
        return `${trackArtists} - ${trackTitle}`;
      case 'title_and_artists':
        return `${trackTitle} - ${trackArtists}`;
      default:
        return trackTitle;
    }
  };

  const getActivityState = () => {
    switch (statusName) {
      case 'artists_and_title':
      case 'title_and_artists':
        return undefined;
      default:
        return trackArtists;
    }
  };

  const button = (getTrackLink() && parseInt(trackId) > 0) && { label: 'Play on Deezer', url: getTrackLink() };
  const isLivestream = (Date.now() + timeLeft) < Date.now();
  const playedTime = Date.now() - songTime + timeLeft;

  client.user.setActivity({
    type: ActivityType.Listening,
    statusDisplayType: getStatusDisplayType(),
    details: getActivityDetails(),
    state: getActivityState(),
    largeImageKey: albumCover,
    largeImageText: albumTitle,
    instance: false,
    startTimestamp: playedTime,
    [isLivestream ? 'startTimestamp' : 'endTimestamp']: Date.now() + timeLeft,
    buttons: button ? [button] : undefined,
  }).catch(() => {});
}
