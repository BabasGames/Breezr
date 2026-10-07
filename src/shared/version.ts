export function parseVersion(value: string | undefined | null): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value?.trim() ?? '');
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True only when `tag` is a valid version strictly greater than `current`. */
export function isNewerRelease(tag: string | undefined | null, current: string): boolean {
  const latest = parseVersion(tag);
  const installed = parseVersion(current);
  if (!latest || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== installed[i]) return latest[i] > installed[i];
  }
  return false;
}
