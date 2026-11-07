import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createLiveServer } from './app';
import { createLyricsService } from './lyrics';
import { LiveStore } from './store';

const port = Number(process.env.PORT ?? 63120);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.DATA_DIR ?? './data';
const publicDir = process.env.PUBLIC_DIR ?? './public';

async function main() {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const store = new LiveStore({ file: join(dataDir, 'ids.json') });
  await store.load();
  const lyrics = createLyricsService({ fetch });
  const server = createLiveServer({ store, lyrics, publicDir });
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
