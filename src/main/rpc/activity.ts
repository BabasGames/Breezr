import * as Config from '../config';
import { statusFields } from './status';
import { tray } from '../tray';
import { version } from '../../../package.json';
import { ActivityType } from 'discord-api-types/v10';
import { activityButtons, BUTTON_LABELS } from './activity-buttons';

export async function setActivity({
  timeLeft, playing, client, albumTitle, albumId, trackArtists, trackTitle, albumCover, app, type, trackId, songTime,
  firstArtistId, liveUrl,
}: ActivityOptions) {
  if (!client?.user || !client.isConnected) throw new Error('Not connected to Discord');
  const statusName = Config.get(app, 'status_name');

  if (tray) {
    const tooltipText = Config.get(app, 'tooltip_text');
    switch (tooltipText) {
      case 'app_name':
        tray.setToolTip('Breezr');
        break;
      case 'app_version':
        tray.setToolTip(`Version ${version}`);
        break;
      case 'app_name_and_version':
        tray.setToolTip(`Breezr version ${version}`);
        break;
      case 'artists_and_title':
        tray.setToolTip(`${trackArtists} - ${trackTitle}`);
        break;
      case 'title_and_artists':
        tray.setToolTip(`${trackTitle} - ${trackArtists}`);
        break;
    }
  }
  if (!playing) return client.user.clearActivity();

  const getTrackLink = () => {
    switch (type) {
      case 'song':
        return `https://www.deezer.com/track/${trackId}`;
      case 'episode':
        return `https://www.deezer.com/episode/${trackId}`;
    }
  };

  const getTrackTitle = () => {
    if (trackTitle.length == 1) return trackTitle.concat(' ');
    return trackTitle;
  };

  const trackLink = getTrackLink();
  const buttons = activityButtons(
    trackLink && Number.parseInt(trackId) > 0 ? trackLink : undefined,
    liveUrl,
    BUTTON_LABELS,
  );
  const isLivestream = (Date.now() + timeLeft) < Date.now();
  const playedTime = Date.now() - songTime + timeLeft;

  // Rejections (e.g. Discord's rate limit) reach the caller so it can retry instead of assuming the update landed.
  return client.user.setActivity({
    type: ActivityType.Listening,
    ...statusFields(statusName, trackTitle, trackArtists),
    details: getTrackTitle(),
    detailsUrl: trackLink,
    state: trackArtists,
    stateUrl: firstArtistId ? `https://www.deezer.com/artist/${firstArtistId}` : undefined,
    largeImageKey: albumCover,
    largeImageText: albumTitle,
    largeImageUrl: albumId ? `https://www.deezer.com/album/${albumId}` : undefined,
    instance: false,
    startTimestamp: playedTime,
    [isLivestream ? 'startTimestamp' : 'endTimestamp']: Date.now() + timeLeft,
    buttons,
  });
}

interface ActivityOptions {
  /** The live link, when the user chose to show it in the Discord status. */
  liveUrl?: string;
  client: import('@xhayper/discord-rpc').Client;
  albumId: number;
  trackId: string;
  playing: boolean;
  timeLeft: number,
  trackTitle: string;
  trackArtists: string;
  albumCover: string;
  albumTitle: string;
  app: Electron.App;
  type: string,
  songTime: number;
  firstArtistId: string;
}
