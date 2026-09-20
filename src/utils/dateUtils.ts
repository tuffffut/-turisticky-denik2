/**
 * Safe date utilities for Horský Deník
 * Prevents "Invalid Date" displays and NaN sort crashes.
 */

export function parseValidDate(dateVal?: any): string {
  if (!dateVal) {
    return new Date().toISOString().split('T')[0];
  }
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

export function getDateTimestamp(dateVal?: any): number {
  if (!dateVal) return 0;
  const d = new Date(dateVal);
  const time = d.getTime();
  return isNaN(time) ? 0 : time;
}

export function formatDateDisplay(
  dateVal?: any,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }
): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    // Try regex fallback for YYYY-MM-DD
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateVal));
    if (match) {
      const fallback = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (!isNaN(fallback.getTime())) {
        return fallback.toLocaleDateString('cs-CZ', options);
      }
    }
    return '';
  }
  return d.toLocaleDateString('cs-CZ', options);
}
