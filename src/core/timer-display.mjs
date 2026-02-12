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
  const fallbackLabelByKey = {
    x: 'X',
    instagram: 'Instagram',
  };

  const rawKey = siteStatus?.siteKey;
  const normalizedFallback = fallbackLabelByKey[rawKey] ?? (rawKey ? 'Site' : 'Site');
  const label = siteStatus?.label ?? normalizedFallback;

  if (siteStatus?.blocked) {
    const reason = siteStatus.reason ?? 'blocked';
    return `${label} blocked (${reason}): ${formatDuration(siteStatus.remainingSec)} left`;
  }

  if (siteStatus?.breakGlassActive) {
    return `${label}: Break-glass active (${formatDuration(siteStatus.breakGlassRemainingSec)} left)`;
  }

  return `${label}: Session ${formatDuration(siteStatus?.sessionRemainingSec)} left • Daily ${formatDuration(siteStatus?.dailyRemainingSec)} left`;
}
