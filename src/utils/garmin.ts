import { MountainHike, HikeDifficulty } from '../types';

export interface ParsedUrlParams {
  key: string | null;
  routeId: string | null;
  editRouteId: string | null;
  isNewRoute: boolean;
  hikeData: Partial<MountainHike>;
  gpxUrl: string | null;
}

/**
 * Parses distance string in km or meters into km number.
 * Handles formats like: "14.5", "14,5", "14.5km", "14500", "14500m".
 */
export function parseDistanceParam(val: string | null): number | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  const isMetersExplicit = /m$/i.test(trimmed) && !/km$/i.test(trimmed);
  const clean = trimmed
    .replace(/km/i, '')
    .replace(/m/i, '')
    .replace(/\s+/g, '')
    .replace(',', '.');
  const num = parseFloat(clean);
  if (isNaN(num) || num <= 0) return undefined;

  // If explicit meters or value >= 500 without decimal point, convert to km
  if (isMetersExplicit || (num >= 500 && !trimmed.includes('.') && !trimmed.includes(','))) {
    return Math.round((num / 1000) * 10) / 10;
  }
  return Math.round(num * 10) / 10;
}

/**
 * Parses elevation in meters (gain or loss).
 * Handles formats like: "850", "+850m", "850 m", "-650".
 */
export function parseElevationParam(val: string | null): number | undefined {
  if (!val) return undefined;
  const clean = val.replace(/[^0-9.-]/g, '');
  const num = Math.abs(parseFloat(clean));
  if (isNaN(num) || num <= 0) return undefined;
  return Math.round(num);
}

/**
 * Parses time/duration into standard "Xh Ym" format.
 * Handles:
 * - "03:45:10" -> "3h 45m"
 * - "01:30" -> "1h 30m"
 * - "13500" (seconds) -> "3h 45m"
 * - "225m" (minutes) -> "3h 45m"
 * - "3h 45m" / "4h" -> "3h 45m" / "4h"
 */
export function parseTimeParam(val: string | null): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();

  // Already standard format like "4h 30m" or "4h"
  if (/^\d+\s*h(?:\s*\d+\s*m)?$/i.test(trimmed)) {
    return trimmed;
  }

  // Format HH:MM:SS or HH:MM
  const colonMatch = trimmed.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m`;
  }

  // Format like "240m" (minutes)
  const minMatch = trimmed.match(/^(\d+)\s*m(?:in)?$/i);
  if (minMatch) {
    const totalMin = parseInt(minMatch[1], 10);
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m`;
  }

  // Pure integer: if large (> 120), treat as seconds (e.g. from Garmin elapsed_time)
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num > 300) {
      // Seconds
      const hours = Math.floor(num / 3600);
      const minutes = Math.floor((num % 3600) / 60);
      return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m`;
    }
  }

  return trimmed;
}

/**
 * Parses difficulty string or determines from elevation/distance.
 */
export function parseDifficultyParam(
  val: string | null,
  elevation?: number,
  distance?: number
): HikeDifficulty {
  if (val) {
    const clean = val.toLowerCase().trim();
    if (clean === 'easy' || clean === 'lehka' || clean === 'lehká' || clean === 'snadna') return 'easy';
    if (clean === 'hard' || clean === 'tezka' || clean === 'těžká' || clean === 'narocna' || clean === 'náročná') return 'hard';
    if (clean === 'ferrata' || clean === 'expert' || clean === 'velmi tezka' || clean === 'extrem') return 'ferrata';
    if (clean === 'moderate' || clean === 'stredni' || clean === 'střední') return 'moderate';
  }
  if (elevation && elevation > 1000) return 'hard';
  if (distance && distance > 22) return 'hard';
  if (elevation && elevation < 400 && (!distance || distance < 10)) return 'easy';
  return 'moderate';
}

/**
 * Parses date parameter into YYYY-MM-DD.
 */
export function parseDateParam(val: string | null): string {
  if (!val) return new Date().toISOString().split('T')[0];
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Fully parses URL query parameters for Telegram and Garmin integrations.
 */
export function parseUrlSearch(search: string): ParsedUrlParams {
  const params = new URLSearchParams(search);

  const key = params.get('key')?.trim() || null;

  // Edit route ID parameter (from Garmin Telegram prompt: ?edit=XYZ)
  const editRouteId =
    params.get('edit')?.trim() ||
    params.get('editRoute')?.trim() ||
    params.get('editHike')?.trim() ||
    null;

  // Route ID parameter (support routeId, hikeId, hike, id, route, or edit)
  const routeId =
    editRouteId ||
    params.get('routeId')?.trim() ||
    params.get('hikeId')?.trim() ||
    params.get('hike')?.trim() ||
    params.get('route')?.trim() ||
    params.get('id')?.trim() ||
    null;

  // newRoute flag (support newRoute=true, newRoute=1, newRoute, action=new, newHike=true)
  const newRouteRaw = params.get('newRoute');
  const actionRaw = params.get('action');
  const newHikeRaw = params.get('newHike');
  const isNewRoute =
    newRouteRaw === 'true' ||
    newRouteRaw === '1' ||
    newRouteRaw === '' ||
    actionRaw === 'new' ||
    newHikeRaw === 'true' ||
    newHikeRaw === '1';

  // Garmin & Hike parameters
  const rawTitle =
    params.get('title') ||
    params.get('name') ||
    params.get('activityName') ||
    params.get('activity') ||
    '';

  const rawRange =
    params.get('mountainRange') ||
    params.get('range') ||
    params.get('location') ||
    params.get('region') ||
    '';

  const rawDist =
    params.get('distance') ||
    params.get('distanceKm') ||
    params.get('dist') ||
    params.get('length') ||
    null;

  const rawElevGain =
    params.get('elevation') ||
    params.get('elevationGain') ||
    params.get('elevationGainM') ||
    params.get('ascent') ||
    params.get('gain') ||
    null;

  const rawElevLoss =
    params.get('elevationLoss') ||
    params.get('elevationLossM') ||
    params.get('descent') ||
    params.get('loss') ||
    null;

  const rawTime =
    params.get('time') ||
    params.get('duration') ||
    params.get('movingTime') ||
    params.get('elapsedTime') ||
    null;

  const rawDifficulty = params.get('difficulty') || null;
  const rawWeather = params.get('weather') || '';
  const rawDate = params.get('date') || null;
  const rawHighestPoint =
    params.get('highestPoint') ||
    params.get('highestPointM') ||
    params.get('maxElevation') ||
    null;

  const gpxUrl =
    params.get('gpxUrl')?.trim() ||
    params.get('gpx')?.trim() ||
    params.get('trackUrl')?.trim() ||
    params.get('fileUrl')?.trim() ||
    null;

  const distanceKm = parseDistanceParam(rawDist);
  const elevationGainM = parseElevationParam(rawElevGain);
  const elevationLossM = parseElevationParam(rawElevLoss) ?? elevationGainM;
  const duration = parseTimeParam(rawTime);
  const difficulty = parseDifficultyParam(rawDifficulty, elevationGainM, distanceKm);
  const highestPointM = parseElevationParam(rawHighestPoint);
  const date = parseDateParam(rawDate);

  const title = rawTitle ? decodeURIComponent(rawTitle) : undefined;
  const mountainRange = rawRange ? decodeURIComponent(rawRange) : undefined;
  const weather = rawWeather ? decodeURIComponent(rawWeather) : undefined;

  const hikeData: Partial<MountainHike> = {
    ...(title && { title }),
    ...(mountainRange && { mountainRange }),
    date,
    ...(distanceKm !== undefined && { distanceKm }),
    ...(elevationGainM !== undefined && { elevationGainM }),
    ...(elevationLossM !== undefined && { elevationLossM }),
    ...(duration && { duration }),
    difficulty,
    ...(highestPointM !== undefined && { highestPointM }),
    ...(weather && { weather }),
  };

  return {
    key,
    routeId,
    editRouteId,
    isNewRoute,
    hikeData,
    gpxUrl,
  };
}
