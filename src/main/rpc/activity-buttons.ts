export interface ActivityButton { label: string; url: string }

/** Discord shows at most two buttons: Deezer's track page first, then the live link when shared. */
export function activityButtons(
  trackLink: string | undefined, liveUrl: string | undefined, labels: { play: string; lyrics: string },
): ActivityButton[] | undefined {
  const buttons: ActivityButton[] = [];
  if (trackLink) buttons.push({ label: labels.play, url: trackLink });
  if (liveUrl) buttons.push({ label: labels.lyrics, url: liveUrl });
  return buttons.length > 0 ? buttons : undefined;
}
