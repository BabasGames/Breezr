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
