// While Breezr sits in the background, Deezer's page keeps memory it no longer uses. A full garbage collection
// gives some of it back (about 70 MB measured after an hour of listening). It is only run when the window has
// lost the focus: nothing is redrawn, and the audio, decoded on its own thread, does not notice the short pause.

type TimerId = ReturnType<typeof setTimeout> | number;

export function createMemoryTrim(opts: {
  trim: () => unknown;
  firstAfterMs?: number;
  everyMs?: number;
  setTimer?: (fn: () => void, ms: number) => TimerId;
  clearTimer?: (id: TimerId) => void;
}) {
  const firstAfterMs = opts.firstAfterMs ?? 2 * 60_000;
  const everyMs = opts.everyMs ?? 10 * 60_000;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: TimerId | null = null;

  const run = () => {
    try {
      void Promise.resolve(opts.trim()).catch(() => undefined);
    } catch {
      // A failed trim (debugger busy, page navigating) waits for the next round.
    }
    timer = setTimer(run, everyMs);
  };

  return {
    /** The window lost the focus or was hidden. */
    background() {
      if (timer === null) timer = setTimer(run, firstAfterMs);
    },
    /** The window is in use again: no trim while someone looks at it. */
    foreground() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
