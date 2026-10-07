import { expect, test } from 'bun:test';
import { isDeezerUrl } from '../src/shared/origin';

test.each([
  'https://www.deezer.com/fr/',
  'https://deezer.com/',
  'https://account.deezer.com/login/',
])('trusts %p', (url) => expect(isDeezerUrl(url)).toBe(true));

test.each([
  'https://evildeezer.com/',
  'https://deezer.com.evil.example/',
  'http://www.deezer.com/',
  'https://accounts.google.com/',
  'https://14894270.fls.doubleclick.net/activityi',
  'file:///home/x/offline.html',
  'not a url',
  '',
  undefined,
])('rejects %p', (url) => expect(isDeezerUrl(url)).toBe(false));

import { classifyWindowOpen } from '../src/shared/origin';

test.each([
  ['https://www.facebook.com/dialog/oauth?x=1', 'popup'],
  ['https://facebook.com/login', 'popup'],
  ['https://appleid.apple.com/auth/authorize', 'popup'],
  ['https://accounts.google.com/o/oauth2/auth', 'popup'],
  ['https://www.deezer.com/fr/artist/1', 'external'],
  ['http://example.com/', 'external'],
  ['https://evil.example/?next=facebook.com', 'external'],
  ['https://facebook.com.evil.example/', 'external'],
  ['http://www.facebook.com/', 'external'],
  ['file:///etc/passwd', 'deny'],
  ['smb://attacker/share', 'deny'],
  ['javascript:alert(1)', 'deny'],
  ['not a url', 'deny'],
])('classifyWindowOpen(%p) → %p', (url, expected) => expect(classifyWindowOpen(url)).toBe(expected));
