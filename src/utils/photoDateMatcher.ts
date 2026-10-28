import ExifReader from 'exifreader';
import { HikeRoute } from '../types';

export interface PhotoInfo {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  dateStr?: string;       // "YYYY-MM-DD"
  timeStr?: string;       // "HH:MM:SS"
  timestamp?: number;     // epoch ms
  source: 'exif' | 'file' | 'unknown';
  matchedRouteId?: string;
  matchReason?: string;
}

export interface MatchedGroup {
  route: HikeRoute;
  photos: PhotoInfo[];
}

/**
 * Parses EXIF date/time string into ISO date, time, and epoch ms.
 * Formats: "YYYY:MM:DD HH:MM:SS", "YYYY-MM-DD HH:MM:SS", etc.
 */
function parseDateString(str: string): { dateStr: string; timeStr: string; timestamp: number } | null {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/(\d{4})[:\/\-](\d{2})[:\/\-](\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/);
  if (match) {
    const [_, y, m, d, hh, mm, ss = '00'] = match;
    const dateStr = `${y}-${m}-${d}`;
    const timeStr = `${hh}:${mm}:${ss}`;
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (!isNaN(dt.getTime())) {
      return { dateStr, timeStr, timestamp: dt.getTime() };
    }
  }
  return null;
}

/**
 * Analyzes a single image file for EXIF date/time or falls back to file.lastModified.
 */
export async function analyzePhotoFile(file: File): Promise<PhotoInfo> {
  const id = 'p_' + Math.random().toString(36).substring(2, 10);
  const previewUrl = URL.createObjectURL(file);
  const name = file.name || 'foto.jpg';

  let dateStr: string | undefined;
  let timeStr: string | undefined;
  let timestamp: number | undefined;
  let source: 'exif' | 'file' | 'unknown' = 'unknown';

  try {
    const tags = await ExifReader.load(file);
    const exifRaw =
      tags['DateTimeOriginal']?.description ||
      tags['DateTimeDigitized']?.description ||
      tags['DateTime']?.description ||
      tags['Date/Time Original']?.description ||
      (tags['Date/Time Original'] as any)?.value;

    if (exifRaw) {
      const parsed = parseDateString(String(exifRaw));
      if (parsed) {
        dateStr = parsed.dateStr;
        timeStr = parsed.timeStr;
        timestamp = parsed.timestamp;
        source = 'exif';
      }
    }
  } catch (err) {
    // ExifReader could fail on certain formats, gracefully fall back to file metadata
  }

  // Fallback to file.lastModified if no EXIF was found
  if (!dateStr && file.lastModified) {
    const dt = new Date(file.lastModified);
    if (!isNaN(dt.getTime())) {
      dateStr = dt.toISOString().split('T')[0];
      timeStr = dt.toTimeString().split(' ')[0];
      timestamp = dt.getTime();
      source = 'file';
    }
  }

  return {
    id,
    file,
    previewUrl,
    name,
    dateStr,
    timeStr,
    timestamp,
    source,
  };
}

/**
/**
 * Resolves the effective start time of a route ("HH:MM").
 * Checks route.startTime first, then extracts from trackpoints[0].time in Europe/Prague / local time.
 */
export function getRouteEffectiveStartTime(route: HikeRoute): string {
  if (route.startTime && typeof route.startTime === 'string' && route.startTime.trim()) {
    const s = route.startTime.trim();
    if (s.includes(':')) {
      const [h, m] = s.split(':');
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
    return s;
  }
  const pts = route.trackpoints || route.trackPoints;
  if (Array.isArray(pts) && pts.length > 0 && pts[0]?.time) {
    try {
      const dt = new Date(pts[0].time);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleTimeString('cs-CZ', {
          timeZone: 'Europe/Prague',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      }
    } catch {}
  }
  return '';
}

/**
 * Calculates startMs, endMs, startTime, and endTime for an activity route.
 */
export function getRouteTimeInterval(r: HikeRoute): { startMs: number; endMs: number; startTime: string; endTime: string } {
  const rDateOnly = (r.date || '').slice(0, 10);
  const stStr = getRouteEffectiveStartTime(r) || '09:00';
  const timeParts = stStr.split(':');
  const hh = timeParts[0] || '09';
  const mm = timeParts[1] || '00';
  const startDt = new Date(`${rDateOnly}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`);
  const startMs = !isNaN(startDt.getTime()) ? startDt.getTime() : new Date(`${rDateOnly}T09:00:00`).getTime();

  let durationMs = 3 * 3600 * 1000;
  const pts = r.trackpoints || r.trackPoints;
  if (Array.isArray(pts) && pts.length > 1 && pts[0]?.time && pts[pts.length - 1]?.time) {
    const t0 = new Date(pts[0].time).getTime();
    const t1 = new Date(pts[pts.length - 1].time).getTime();
    if (!isNaN(t0) && !isNaN(t1) && t1 > t0) {
      durationMs = t1 - t0;
    }
  } else if (r.duration) {
    const hMatch = r.duration.match(/(\d+)\s*h/);
    const mMatch = r.duration.match(/(\d+)\s*m/);
    if (hMatch || mMatch) {
      const h = hMatch ? parseInt(hMatch[1], 10) : 0;
      const m = mMatch ? parseInt(mMatch[1], 10) : 0;
      durationMs = (h * 3600 + m * 60) * 1000;
    }
  }

  const endMs = startMs + Math.max(20 * 60 * 1000, durationMs);
  const endDt = new Date(endMs);
  const endHh = String(endDt.getHours()).padStart(2, '0');
  const endMm = String(endDt.getMinutes()).padStart(2, '0');
  const endTime = `${endHh}:${endMm}`;

  return { startMs, endMs, startTime: stStr, endTime };
}

/**
 * Automatically matches analyzed photos against existing routes.
 * Uses activity calendar date and start/duration time window.
 */
export function matchPhotosToRoutes(photos: PhotoInfo[], routes: HikeRoute[]): PhotoInfo[] {
  if (!routes || routes.length === 0) return photos;

  return photos.map((photo) => {
    if (!photo.dateStr) {
      return { ...photo, matchedRouteId: undefined, matchReason: 'Chybí datum pořízení fotografie' };
    }

    // 1. Find all routes on the exact same date (YYYY-MM-DD)
    const sameDayRoutes = routes.filter((r) => {
      const rDate = (r.date || '').slice(0, 10);
      return rDate === photo.dateStr;
    });

    if (sameDayRoutes.length === 1) {
      const target = sameDayRoutes[0];
      const targetTime = getRouteEffectiveStartTime(target);
      const timeNote = targetTime ? ` • od ${targetTime}` : '';
      return {
        ...photo,
        matchedRouteId: target.id,
        matchReason: `Shoda podle data výpravy (${new Date(target.date).toLocaleDateString('cs-CZ')}${timeNote})`,
      };
    }

    if (sameDayRoutes.length > 1) {
      // Multiple activities on the same date: score by exact time window & proximity
      if (photo.timestamp) {
        let bestRoute: HikeRoute = sameDayRoutes[0];
        let bestInterval = getRouteTimeInterval(sameDayRoutes[0]);
        let bestDiff = Infinity;
        let bestInWindow = false;

        for (const r of sameDayRoutes) {
          const interval = getRouteTimeInterval(r);

          // Buffer of 45 minutes before start and after end
          const inWindow =
            photo.timestamp >= interval.startMs - 45 * 60 * 1000 &&
            photo.timestamp <= interval.endMs + 45 * 60 * 1000;

          // Distance to time window: 0 if inside, else absolute distance to closest window edge
          let diff = 0;
          if (photo.timestamp < interval.startMs) {
            diff = interval.startMs - photo.timestamp;
          } else if (photo.timestamp > interval.endMs) {
            diff = photo.timestamp - interval.endMs;
          } else {
            // Inside window: secondary diff is distance to midpoint
            const centerMs = (interval.startMs + interval.endMs) / 2;
            diff = Math.abs(photo.timestamp - centerMs) / 1000;
          }

          if (inWindow && !bestInWindow) {
            bestInWindow = true;
            bestDiff = diff;
            bestRoute = r;
            bestInterval = interval;
          } else if (inWindow && bestInWindow && diff < bestDiff) {
            bestDiff = diff;
            bestRoute = r;
            bestInterval = interval;
          } else if (!bestInWindow && diff < bestDiff) {
            bestDiff = diff;
            bestRoute = r;
            bestInterval = interval;
          }
        }

        const photoTimeFormatted = photo.timeStr ? photo.timeStr.slice(0, 5) : '';
        return {
          ...photo,
          matchedRouteId: bestRoute.id,
          matchReason: bestInWindow
            ? `Přesná časová shoda (foto ${photoTimeFormatted} • výprava ${bestInterval.startTime} - ${bestInterval.endTime})`
            : `Nejbližší čas výpravy (foto ${photoTimeFormatted} • výprava ${bestInterval.startTime} - ${bestInterval.endTime})`,
        };
      } else {
        // No time metadata, pick first route on that date
        const target = sameDayRoutes[0];
        const targetTime = getRouteEffectiveStartTime(target);
        return {
          ...photo,
          matchedRouteId: target.id,
          matchReason: `Přiřazeno k výpravě (${new Date(target.date).toLocaleDateString('cs-CZ')}${targetTime ? ` • ${targetTime}` : ''})`,
        };
      }
    }

    // 2. Check +/- 1 day (e.g. timezone shift or midnight hikes)
    if (photo.timestamp) {
      const nearRoutes = routes.filter((r) => {
        if (!r.date) return false;
        const rDateOnly = r.date.slice(0, 10);
        const rMs = new Date(`${rDateOnly}T12:00:00`).getTime();
        return !isNaN(rMs) && Math.abs(rMs - photo.timestamp!) <= 24 * 3600 * 1000 * 1.5;
      });

      if (nearRoutes.length === 1) {
        const target = nearRoutes[0];
        const targetTime = getRouteEffectiveStartTime(target);
        return {
          ...photo,
          matchedRouteId: target.id,
          matchReason: `Doporučená výprava (časový posun ±1 den: ${new Date(target.date).toLocaleDateString('cs-CZ')}${targetTime ? ` • ${targetTime}` : ''})`,
        };
      }
    }

    return {
      ...photo,
      matchedRouteId: undefined,
      matchReason: `Nenalezena žádná výprava pro datum ${photo.dateStr}`,
    };
  });
}
