import { describe, expect, test } from 'bun:test';
import { feedbackUrl, REPO_URL } from '../src/shared/feedback';

describe('feedback links', () => {
  test('a bug report opens the bug form with the version already filled in', () => {
    const url = new URL(feedbackUrl('bug', '2.1.0'));
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`);
    expect(url.searchParams.get('template')).toBe('bug.yml');
    expect(url.searchParams.get('version')).toBe('2.1.0');
  });

  test('an idea opens the idea form', () => {
    const url = new URL(feedbackUrl('idea', '2.1.0'));
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`);
    expect(url.searchParams.get('template')).toBe('idea.yml');
  });

  test('both point to Breezr\'s own repository', () => {
    expect(REPO_URL).toBe('https://github.com/BabasGames/Breezr');
  });
});
