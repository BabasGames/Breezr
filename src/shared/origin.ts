/** True for https pages on deezer.com or one of its subdomains — the only pages allowed to drive Breezr's settings. */
export function isDeezerUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (hostname === 'deezer.com' || hostname.endsWith('.deezer.com'));
  } catch {
    return false;
  }
}
