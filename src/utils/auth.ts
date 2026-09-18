import { PinConfig, UserRole } from '../types';

const ADMIN_PIN_KEY = 'horsky_denik_admin_pin';
const READER_PIN_KEY = 'horsky_denik_reader_pin';

export const DEFAULT_ADMIN_PIN = '1234';
export const DEFAULT_READER_PIN = '0000';

export function getStoredPins(): PinConfig {
  let adminPin = localStorage.getItem(ADMIN_PIN_KEY);
  let readerPin = localStorage.getItem(READER_PIN_KEY);

  if (!adminPin) {
    adminPin = DEFAULT_ADMIN_PIN;
    localStorage.setItem(ADMIN_PIN_KEY, adminPin);
  }
  if (!readerPin) {
    readerPin = DEFAULT_READER_PIN;
    localStorage.setItem(READER_PIN_KEY, readerPin);
  }

  return { adminPin, readerPin };
}

export function savePins(newAdminPin: string, newReaderPin: string): boolean {
  if (!newAdminPin || !newReaderPin) return false;
  localStorage.setItem(ADMIN_PIN_KEY, newAdminPin.trim());
  localStorage.setItem(READER_PIN_KEY, newReaderPin.trim());
  return true;
}

export function resetPinsToDefault(): PinConfig {
  localStorage.setItem(ADMIN_PIN_KEY, DEFAULT_ADMIN_PIN);
  localStorage.setItem(READER_PIN_KEY, DEFAULT_READER_PIN);
  return { adminPin: DEFAULT_ADMIN_PIN, readerPin: DEFAULT_READER_PIN };
}

/**
 * Validates a PIN against configured pins and returns the matching UserRole or null.
 */
export function authenticatePin(pin: string, config: PinConfig): UserRole | null {
  const clean = pin.trim();
  if (clean === config.adminPin) {
    return 'admin';
  }
  if (clean === config.readerPin) {
    return 'reader';
  }
  return null;
}

/**
 * Checks window.location.search for ?key=... and attempts immediate role unlock.
 */
export function checkUrlKeyForRole(config: PinConfig): { role: UserRole | null; attemptedKey: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (!key) {
      return { role: null, attemptedKey: null };
    }
    const role = authenticatePin(key, config);
    return { role, attemptedKey: key };
  } catch {
    return { role: null, attemptedKey: null };
  }
}

/**
 * Generates an absolute share link for a given PIN or role.
 */
export function getShareUrl(pin: string): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('key', pin);
    url.searchParams.delete('hike');
    url.searchParams.delete('gpxUrl');
    return url.toString();
  } catch {
    return `${window.location.origin}${window.location.pathname}?key=${pin}`;
  }
}

/**
 * Generates a direct share link to a specific hike with embedded unlock key.
 */
export function getHikeShareUrl(pin: string, hikeId: string): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('key', pin);
    url.searchParams.set('routeId', hikeId);
    url.searchParams.delete('hike');
    url.searchParams.delete('gpxUrl');
    url.searchParams.delete('newRoute');
    return url.toString();
  } catch {
    return `${window.location.origin}${window.location.pathname}?key=${pin}&routeId=${hikeId}`;
  }
}

/**
 * Generates a Telegram web share URL.
 */
export function getTelegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}
