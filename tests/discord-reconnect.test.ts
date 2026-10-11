import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, unlinkSync } from 'fs';
import { createServer, type Server, type Socket } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { keepConnected, makeClient } from '../src/main/rpc/client';

// A fake Discord: answers the IPC handshake with READY, can quit and come back.
function fakeDiscord(path: string) {
  let server: Server | null = null;
  let sockets: Socket[] = [];
  let connections = 0;
  const frame = (op: number, body: unknown) => {
    const data = Buffer.from(JSON.stringify(body));
    const head = Buffer.alloc(8);
    head.writeUInt32LE(op, 0);
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data]);
  };
  return {
    get connections() { return connections; },
    start: () => new Promise<void>((resolve) => {
      try { unlinkSync(path); } catch { /* not there yet */ }
      server = createServer((socket) => {
        connections++;
        sockets.push(socket);
        socket.on('error', () => undefined);
        socket.once('data', () => socket.write(frame(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1, user: { id: '1', username: 'fake' } } })));
      }).listen(path, resolve);
    }),
    quit: () => new Promise<void>((resolve) => {
      sockets.forEach((s) => s.destroy());
      sockets = [];
      if (!server) return resolve();
      server.close(() => resolve());
      server = null;
    }),
  };
}

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('Discord connection', () => {
  let dir = '';
  let cleanup: (() => Promise<void>)[] = [];
  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), 'breezr-ipc-'));
    const path = join(dir, 'discord-ipc-0');
    const discord = fakeDiscord(path);
    const client = makeClient([{ platform: [process.platform], format: () => path }]);
    const events: string[] = [];
    client.on('ready', () => events.push('ready'));
    client.on('disconnected', () => events.push('disconnected'));
    return { discord, client, events };
  };
  afterEach(async () => {
    for (const fn of cleanup) await fn();
    cleanup = [];
    rmSync(dir, { recursive: true, force: true });
  });

  test('notices when Discord quits, and reconnects when it comes back', async () => {
    const { discord, client, events } = setup();
    await discord.start();
    const keeper = keepConnected(client, 50);
    cleanup.push(async () => { keeper.stop(); await discord.quit(); });
    await until(() => client.isConnected);

    await discord.quit();
    await until(() => events.includes('disconnected'));
    expect(client.isConnected).toBe(false);

    await discord.start();
    await until(() => client.isConnected);
    expect(discord.connections).toBe(2);
    expect(events.filter((e) => e === 'ready').length).toBe(2);
  });

  test('connects once Discord starts, even if it was not running at first', async () => {
    const { discord, client } = setup();
    const keeper = keepConnected(client, 50);
    cleanup.push(async () => { keeper.stop(); await discord.quit(); });
    await new Promise((r) => setTimeout(r, 200));
    expect(client.isConnected).toBe(false);

    await discord.start();
    await until(() => client.isConnected);
    expect(discord.connections).toBe(1);
  });

  test('retrying while Discord is closed does not pile up listeners', async () => {
    const { discord, client } = setup();
    const keeper = keepConnected(client, 20);
    cleanup.push(async () => { keeper.stop(); await discord.quit(); });
    await new Promise((r) => setTimeout(r, 400));
    expect(client.listenerCount('connected')).toBeLessThanOrEqual(1);
  });

  test('stops trying once stopped', async () => {
    const { discord, client } = setup();
    const keeper = keepConnected(client, 50);
    keeper.stop();
    await discord.start();
    cleanup.push(() => discord.quit());
    await new Promise((r) => setTimeout(r, 300));
    expect(discord.connections).toBe(0);
  });
});
