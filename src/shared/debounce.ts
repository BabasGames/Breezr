/** Delay before the Deezer page previews a colour that is still being dragged. */
export const PREVIEW_DEBOUNCE_MS = 400;

export interface Timers { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }

export interface Debouncer<A extends unknown[]> {
  /** (Re)starts the delay; only the last call's arguments are used. */
  call(...args: A): void;
  /** Runs the pending call now, if any. */
  flush(): void;
  /** Forgets the pending call. */
  cancel(): void;
  pending(): boolean;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createDebouncer<A extends unknown[]>(
  fn: (...args: A) => void, delayMs: number, timers: Timers = realTimers,
): Debouncer<A> {
  let handle: unknown = null;
  let args: A | null = null;

  const run = () => {
    handle = null;
    const pendingArgs = args;
    args = null;
    if (pendingArgs) fn(...pendingArgs);
  };

  return {
    call(...next: A) {
      args = next;
      if (handle !== null) timers.clear(handle);
      handle = timers.set(run, delayMs);
    },
    flush() {
      if (handle === null) return;
      timers.clear(handle);
      run();
    },
    cancel() {
      if (handle !== null) timers.clear(handle);
      handle = null;
      args = null;
    },
    pending: () => handle !== null,
  };
}
