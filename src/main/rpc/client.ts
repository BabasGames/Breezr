import * as RPC from '@xhayper/discord-rpc';
import type { Socket } from 'net';
import { log } from '../log';
import { clientId } from '../variables';

type PathList = NonNullable<ConstructorParameters<typeof RPC.Client>[0]['transport']> extends infer T
  ? T extends { pathList?: infer P } ? P : never : never;

export function makeClient(pathList?: PathList) {
  return new RPC.Client({ transport: { type: 'ipc', pathList }, clientId });
}

export const client = makeClient();

const RETRY_MS = 8000;

// Internals of @xhayper/discord-rpc 1.5.1 that the two workarounds below have to reset.
interface IpcTransportInternals {
  socket?: Socket;
  isConnected: boolean;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}
interface ClientInternals {
  connectionPromise?: Promise<void>;
  connectionPromiseData?: { timeout: ReturnType<typeof setTimeout> };
}

/**
 * When Discord quits, its socket is already closed by the time the library's close() checks it, so close() returns
 * early: no 'disconnected' event, and the transport keeps the dead socket and still thinks it is connected — the
 * next login() then "succeeds" without connecting. Finish that cleanup ourselves.
 */
function handleDiscordQuitting(target: RPC.Client) {
  const transport = target.transport as unknown as IpcTransportInternals & RPC.Client['transport'];
  transport.on('open', () => {
    const socket = transport.socket;
    socket?.once('close', () => {
      // Closed by the library itself (our disconnect, a stale connection): it already cleaned up.
      if (transport.socket !== socket) return;
      clearInterval(transport.heartbeatTimer);
      clearTimeout(transport.timeoutTimer);
      transport.socket = undefined;
      transport.isConnected = false;
      void target.destroy();
      target.emit('disconnected');
    });
  });
}

/**
 * A failed login leaves its rejected promise in place for 10 s (every retry meanwhile gets it back) and its
 * 'connected' listener forever. Only pending logins listen to 'connected', so dropping them all is safe.
 */
function forgetFailedLogin(target: RPC.Client) {
  const internals = target as unknown as ClientInternals;
  if (internals.connectionPromiseData) clearTimeout(internals.connectionPromiseData.timeout);
  internals.connectionPromise = undefined;
  target.removeAllListeners('connected');
}

/** Keeps `client` connected: retries while Discord is closed or not started yet, and after it quits. */
export function keepConnected(target: RPC.Client, retryMs = RETRY_MS) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const stopRetrying = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const tryLogin = () => {
    if (stopped || target.isConnected) return;
    target.login().then(stopRetrying).catch(() => forgetFailedLogin(target));
  };
  const retry = () => {
    if (stopped || timer) return;
    timer = setInterval(tryLogin, retryMs);
  };
  const onDisconnected = () => {
    log('RPC', 'Discord disconnected, waiting for it to come back...');
    retry();
  };
  handleDiscordQuitting(target);
  target.on('disconnected', onDisconnected);
  target.login().catch(() => {
    forgetFailedLogin(target);
    retry();
  });
  return {
    stop() {
      stopped = true;
      stopRetrying();
      target.off('disconnected', onDisconnected);
    },
  };
}

let keeper: ReturnType<typeof keepConnected> | undefined;

export function connect() {
  client.on('ready', () => log('RPC', `Authed for user @${client.user?.username}`));
  keeper = keepConnected(client);
}

export async function disconnect() {
  log('RPC', 'Disconnecting...');
  keeper?.stop();
  await client.user?.clearActivity(process.pid);
  await client.destroy().then(() => log('RPC', 'Disconnected'));
}
