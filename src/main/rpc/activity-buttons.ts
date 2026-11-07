export interface ActivityButton { label: string; url: string }

/**
 * English for everyone: Discord shows button labels as is to every viewer (it cannot pick a language per
 * viewer), and the people seeing a status are not necessarily speaking the user's interface language.
 */
export const BUTTON_LABELS = { play: 'Play on Deezer', lyrics: 'Live lyrics' } as const;

/** Discord shows at most two buttons: Deezer's track page first, then the live link when shared. */
export function activityButtons(
  trackLink: string | undefined, liveUrl: string | undefined, labels: { play: string; lyrics: string },
): ActivityButton[] | undefined {
  const buttons: ActivityButton[] = [];
  if (trackLink) buttons.push({ label: labels.play, url: trackLink });
  if (liveUrl) buttons.push({ label: labels.lyrics, url: liveUrl });
  return buttons.length > 0 ? buttons : undefined;
}
