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
      return {
        ...photo,
        matchedRouteId: target.id,
        matchReason: `Shoda podle data výpravy (${new Date(target.date).toLocaleDateString('cs-CZ')})`,
      };
    }

    if (sameDayRoutes.length > 1) {
      // Multiple activities on the same date: score by time proximity
      if (photo.timestamp) {
        let bestRoute: HikeRoute = sameDayRoutes[0];
        let bestDiff = Infinity;
        let inWindow = false;

        for (const r of sameDayRoutes) {
          const startTime = r.startTime || '09:00';
          const rDateOnly = (r.date || '').slice(0, 10);
          const timeParts = startTime.split(':');
          const hh = timeParts[0] || '09';
          const mm = timeParts[1] || '00';

          const rStartDt = new Date(`${rDateOnly}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`);
          const rStartMs = !isNaN(rStartDt.getTime()) ? rStartDt.getTime() : new Date(`${rDateOnly}T09:00:00`).getTime();

          // Estimate duration
          let durationMs = 3 * 3600 * 1000;
          if (r.duration) {
            const hMatch = r.duration.match(/(\d+)\s*h/);
            const mMatch = r.duration.match(/(\d+)\s*m/);
            if (hMatch || mMatch) {
              const h = hMatch ? parseInt(hMatch[1]) : 0;
              const m = mMatch ? parseInt(mMatch[1]) : 0;
              durationMs = (h * 3600 + m * 60) * 1000;
            }
          }

          const rEndMs = rStartMs + durationMs;
          // Check if photo is within activity time window (+/- 45 mins buffer)
          const isWithin = photo.timestamp >= (rStartMs - 45 * 60 * 1000) && photo.timestamp <= (rEndMs + 45 * 60 * 1000);
          const centerMs = (rStartMs + rEndMs) / 2;
          const diff = Math.abs(photo.timestamp - centerMs);

          if (isWithin && (!inWindow || diff < bestDiff)) {
            inWindow = true;
            bestDiff = diff;
            bestRoute = r;
          } else if (!inWindow && diff < bestDiff) {
            bestDiff = diff;
            bestRoute = r;
          }
        }

        return {
          ...photo,
          matchedRouteId: bestRoute.id,
          matchReason: inWindow
            ? `Přesná časová shoda (${photo.timeStr || ''} v rámci doby výpravy)`
            : `Nejbližší čas výpravy (${photo.timeStr || ''})`,
        };
      } else {
        // No time, pick first route on that date
        const target = sameDayRoutes[0];
        return {
          ...photo,
          matchedRouteId: target.id,
          matchReason: `Přiřazeno k první výpravě v daný den (${new Date(target.date).toLocaleDateString('cs-CZ')})`,
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
        return {
          ...photo,
          matchedRouteId: target.id,
          matchReason: `Doporučená výprava (časový posun ±1 den: ${new Date(target.date).toLocaleDateString('cs-CZ')})`,
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
