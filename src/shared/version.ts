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

/**
 * Tag of the latest GitHub release from the API answer. 404 means nothing is published yet (''); any other
 * failure (rate limit, 5xx) throws, so a manual check reports an error instead of "you are up to date".
 */
export function latestReleaseTag(status: number, body: unknown): string {
  if (status === 404) return '';
  if (status < 200 || status >= 300) throw new Error(`GitHub answered HTTP ${status}`);
  const tag = typeof body === 'object' && body !== null ? (body as { tag_name?: unknown }).tag_name : undefined;
  return typeof tag === 'string' ? tag : '';
}
