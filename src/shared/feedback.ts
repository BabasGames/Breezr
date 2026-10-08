export const REPO_URL = 'https://github.com/BabasGames/Breezr';

export type FeedbackKind = 'bug' | 'idea';

/** GitHub's new-issue page on the matching form (.github/ISSUE_TEMPLATE); a bug report gets the version prefilled. */
export function feedbackUrl(kind: FeedbackKind, version: string): string {
  const url = new URL(`${REPO_URL}/issues/new`);
  url.searchParams.set('template', `${kind}.yml`);
  if (kind === 'bug') url.searchParams.set('version', version);
  return url.toString();
}
