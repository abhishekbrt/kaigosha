const SITE_LABELS = {
  x: 'X',
  instagram: 'Instagram',
};

function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

export function formatTimerOverlayText(siteStatus) {
  const label = SITE_LABELS[siteStatus?.siteKey] ?? 'Site';

  if (siteStatus?.blocked) {
    const reason = siteStatus.reason ?? 'blocked';
    return `${label} blocked (${reason}): ${formatDuration(siteStatus.remainingSec)} left`;
  }

  return `${label}: Session ${formatDuration(siteStatus?.sessionRemainingSec)} left • Daily ${formatDuration(siteStatus?.dailyRemainingSec)} left`;
}
