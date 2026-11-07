import { join } from 'path';
import { createLiveLink } from './live-link';

let link: ReturnType<typeof createLiveLink> | null = null;

/** The one live link of this Breezr, its credentials next to the config. */
export function liveLink(app: Electron.App) {
  link ??= createLiveLink({ file: join(app.getPath('userData'), 'live-link.json') });
  return link;
}
