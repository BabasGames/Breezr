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

// Sign-in providers Deezer opens in a popup; they must stay inside the app to hand the session back.
const LOGIN_POPUP_HOSTS = ['facebook.com', 'appleid.apple.com', 'accounts.google.com'];

/**
 * What to do with a window.open() from the page: keep sign-in popups inside the app, hand ordinary
 * web links to the system browser, and refuse everything else (file:, smb:, custom app schemes…).
 */
export function classifyWindowOpen(url: string): 'popup' | 'external' | 'deny' {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'deny';
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (parsed.protocol === 'https:' && LOGIN_POPUP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'popup';
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return 'external';
  return 'deny';
}
