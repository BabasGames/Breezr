export function parseVersion(value: string | undefined | null): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value?.trim() ?? '');
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** "beta.2" from "2.3.0-beta.2"; null for a final version. */
function prereleaseOf(value: string): string | null {
  return /^v?\d+\.\d+\.\d+-([0-9A-Za-z.-]+)/.exec(value.trim())?.[1] ?? null;
}

/** Semver order of two pre-release labels: numeric parts as numbers, the rest as text. */
function comparePrerelease(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : NaN;
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : NaN;
    const diff = !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : pa[i].localeCompare(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * True only when `tag` is a valid version strictly greater than `current`. A beta comes before its final
 * version (2.3.0-beta.1 < 2.3.0), so a beta tester is offered the final release.
 */
export function isNewerRelease(tag: string | undefined | null, current: string): boolean {
  const latest = parseVersion(tag);
  const installed = parseVersion(current);
  if (!latest || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== installed[i]) return latest[i] > installed[i];
  }
  const latestPre = prereleaseOf(tag as string);
  const installedPre = prereleaseOf(current);
  if (latestPre === null) return installedPre !== null;
  if (installedPre === null) return false;
  return comparePrerelease(latestPre, installedPre) > 0;
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
