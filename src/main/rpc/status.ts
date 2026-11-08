// What Discord shows in the member list ("Listening to …"). Plain data, no Discord import, so it can be tested.

/** Discord's StatusDisplayType: which field the member list shows. */
const NAME = 0;
const STATE = 1;
const DETAILS = 2;

/**
 * The activity name is also the app name on Discord's activity card: statuses that another field already
 * holds (title in details, artists in state) keep "Deezer" and point the member list at that field instead.
 */
export function statusFields(statusName: string | undefined, title: string, artists: string): { name: string; statusDisplayType: 0 | 1 | 2 } {
  switch (statusName) {
    case 'song_title':
      return { name: 'Deezer', statusDisplayType: DETAILS };
    case 'artists_song':
      return { name: 'Deezer', statusDisplayType: STATE };
    case 'artists_and_title':
      return { name: `${artists} - ${title}`, statusDisplayType: NAME };
    case 'title_and_artists':
      return { name: `${title} - ${artists}`, statusDisplayType: NAME };
    default:
      return { name: 'Deezer', statusDisplayType: NAME };
  }
}
