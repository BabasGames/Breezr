import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { createLiveServer } from './app';
import { createLyricsService } from './lyrics';
import { LiveStore } from './store';
import { createVideoService } from './youtube';
import { ID_PATTERN } from '../../src/shared/live';

const port = Number(process.env.PORT ?? 63120);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.DATA_DIR ?? './data';
const publicDir = process.env.PUBLIC_DIR ?? './public';

/** The server owner's own link ids, one per line in data/priority-links: they get the reserved YouTube quota. */
function readPriorityLinks(): Set<string> {
  try {
    return new Set(readFileSync(join(dataDir, 'priority-links'), 'utf-8').split(/\s+/).filter((id) => ID_PATTERN.test(id)));
  } catch {
    return new Set();
  }
}

/** The YouTube Data API key, put by hand in data/youtube-key (never in the repo); null turns music off. */
function readYouTubeKey(): string | null {
  try {
    return readFileSync(join(dataDir, 'youtube-key'), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const store = new LiveStore({ file: join(dataDir, 'ids.json') });
  await store.load();
  const lyrics = createLyricsService({ fetch });
  const key = readYouTubeKey();
  if (!key) console.error('breezr-live: YouTube key missing: music disabled');
  const videos = createVideoService({ fetch, key, file: join(dataDir, 'youtube.json') });
  await videos.load();
  const server = createLiveServer({ store, lyrics, videos, publicDir, priorityLinks: readPriorityLinks() });
  server.listen(port, host, () => console.log(`breezr-live listening on http://${host}:${port}`));
  const stop = () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
