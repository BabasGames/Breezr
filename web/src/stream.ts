type Source = Pick<EventSource, 'readyState' | 'close'> & {
  onopen: ((this: EventSource, ev: Event) => unknown) | null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null;
};

const CLOSED = 2;

/**
 * The live stream, kept open. EventSource retries by itself after a dropped connection, but gives up for good
 * on an error response (Caddy's 502 while the server restarts, a 429/503): then open a new one, waiting
 * longer each time, back to the first delay once connected.
 */
export function openLiveStream(
  url: string,
  on: { message(data: string): void; connected(): void; reconnecting(): void },
  opts: {
    create?: (url: string) => Source;
    delays?: number[];
    setTimer?: (fn: () => void, ms: number) => void;
  } = {},
) {
  const create = opts.create ?? ((u: string) => new EventSource(u) as Source);
  const delays = opts.delays ?? [2000, 5000, 15_000, 30_000];
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  let attempt = 0;

  const connect = () => {
    const source = create(url);
    source.onopen = () => {
      attempt = 0;
      on.connected();
    };
    source.onmessage = (event) => on.message(String(event.data));
    source.onerror = () => {
      on.reconnecting();
      if (source.readyState !== CLOSED) return;
      source.close();
      setTimer(connect, delays[Math.min(attempt, delays.length - 1)]);
      attempt++;
    };
  };
  connect();
}
