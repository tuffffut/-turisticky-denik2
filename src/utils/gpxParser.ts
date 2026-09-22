import { GPXTrackPoint } from '../types';

/**
 * Calculates distance between two coordinates in kilometers using Haversine formula.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface ParsedGPXResult {
  trackPoints: GPXTrackPoint[];
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  minElevationM: number;
  maxElevationM: number;
  detectedRange?: string;
  name?: string;
  duration?: string; // Formatted e.g. "4h 15m" or "45m" (celkový čas)
  movingDuration?: string; // Formatted e.g. "3h 40m" (čas v pohybu)
  durationMinutes?: number;
  movingDurationMinutes?: number;
  date?: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
}

/**
 * Formats duration in seconds into a friendly Czech string e.g. "4h 25m" or "50m"
 */
export function formatDurationFromSeconds(totalSecs: number): string {
  if (!totalSecs || totalSecs <= 0) return '0m';
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.round((totalSecs % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  }
  return `${mins}m`;
}

/**
 * Parses raw GPX XML string into structured trackpoints and statistics.
 * Computes accurate 3D distance with stationary jitter suppression and track segment handling.
 * Automatically computes activity duration (moving time) and date from GPX timestamps.
 */
export function parseGPX(xmlString: string): ParsedGPXResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('Neplatný formát GPX souboru.');
  }

  // Find name from <name> tag
  const nameTag = xmlDoc.getElementsByTagName('name')[0];
  const name = nameTag ? nameTag.textContent?.trim() || undefined : undefined;

  // Find date from <metadata><time> tag if present
  let metadataDate: string | undefined = undefined;
  const metadataTag = xmlDoc.getElementsByTagName('metadata')[0];
  if (metadataTag) {
    const metaTime = metadataTag.getElementsByTagName('time')[0]?.textContent?.trim();
    if (metaTime) {
      const parsedMetaDate = new Date(metaTime);
      if (!isNaN(parsedMetaDate.getTime())) {
        metadataDate = parsedMetaDate.toISOString().split('T')[0];
      }
    }
  }

  // Parse track segments to respect pause/breaks without phantom distance jumps
  const segmentElements = Array.from(xmlDoc.getElementsByTagName('trkseg'));
  const rawSegments: Element[][] = [];

  if (segmentElements.length > 0) {
    for (const seg of segmentElements) {
      const pts = Array.from(seg.getElementsByTagName('trkpt'));
      if (pts.length > 0) {
        rawSegments.push(pts);
      }
    }
  } else {
    let pts = Array.from(xmlDoc.getElementsByTagName('trkpt'));
    if (pts.length === 0) {
      pts = Array.from(xmlDoc.getElementsByTagName('rtept'));
    }
    if (pts.length === 0) {
      pts = Array.from(xmlDoc.getElementsByTagName('wpt'));
    }
    if (pts.length > 0) {
      rawSegments.push(pts);
    }
  }

  if (rawSegments.length === 0 || rawSegments.every((s) => s.length === 0)) {
    throw new Error('V GPX souboru nebyly nalezeny žádné body trasy (trkpt/rtept/wpt).');
  }

  interface InternalPt {
    lat: number;
    lng: number;
    ele?: number;
    time?: string;
    timestampMs?: number;
    segmentIndex: number;
    embeddedDistMeters?: number;
  }

  const allRawPoints: InternalPt[] = [];
  let minElevationM = Number.POSITIVE_INFINITY;
  let maxElevationM = Number.NEGATIVE_INFINITY;
  let firstTimestamp: Date | null = null;
  let lastTimestamp: Date | null = null;

  for (let sIdx = 0; sIdx < rawSegments.length; sIdx++) {
    const segPts = rawSegments[sIdx];
    for (let i = 0; i < segPts.length; i++) {
      const pt = segPts[i];
      const lat = parseFloat(pt.getAttribute('lat') || '0');
      const lng = parseFloat(pt.getAttribute('lon') || '0');

      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        continue;
      }

      const eleNode = pt.getElementsByTagName('ele')[0];
      const ele = eleNode ? parseFloat(eleNode.textContent || '0') : undefined;

      const timeNode = pt.getElementsByTagName('time')[0];
      const time = timeNode ? timeNode.textContent?.trim() || undefined : undefined;
      let timestampMs: number | undefined = undefined;

      if (time) {
        const d = new Date(time);
        if (!isNaN(d.getTime())) {
          timestampMs = d.getTime();
          if (!firstTimestamp) firstTimestamp = d;
          lastTimestamp = d;
        }
      }

      if (ele !== undefined && !isNaN(ele)) {
        if (ele < minElevationM) minElevationM = ele;
        if (ele > maxElevationM) maxElevationM = ele;
      }

      // Check for Garmin / Strava embedded odometer distance (in meters)
      let embeddedDistMeters: number | undefined = undefined;
      const distEls = pt.getElementsByTagName('distance');
      if (distEls.length > 0) {
        const dVal = parseFloat(distEls[0].textContent || '');
        if (!isNaN(dVal) && dVal >= 0) embeddedDistMeters = dVal;
      }
      if (embeddedDistMeters === undefined) {
        const tpxDistEls = pt.getElementsByTagName('gpxtpx:distance');
        if (tpxDistEls.length > 0) {
          const dVal = parseFloat(tpxDistEls[0].textContent || '');
          if (!isNaN(dVal) && dVal >= 0) embeddedDistMeters = dVal;
        }
      }

      allRawPoints.push({
        lat,
        lng,
        ele: ele !== undefined && !isNaN(ele) ? ele : undefined,
        time,
        timestampMs,
        segmentIndex: sIdx,
        embeddedDistMeters,
      });
    }
  }

  if (allRawPoints.length === 0) {
    throw new Error('GPX soubor neobsahuje platné zeměpisné souřadnice.');
  }

  // Smooth elevations using a 3-point moving window within each segment to remove sensor noise
  const smoothedEle: (number | undefined)[] = allRawPoints.map((pt, i, arr) => {
    if (pt.ele === undefined) return undefined;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    if (
      prev?.ele !== undefined &&
      next?.ele !== undefined &&
      prev.segmentIndex === pt.segmentIndex &&
      next.segmentIndex === pt.segmentIndex
    ) {
      return (prev.ele + pt.ele + next.ele) / 3;
    }
    return pt.ele;
  });

  const trackPoints: GPXTrackPoint[] = [];
  let totalDistanceKm = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let movingDurationSeconds = 0;

  for (let i = 0; i < allRawPoints.length; i++) {
    const pt = allRawPoints[i];
    const currentEle = smoothedEle[i] ?? pt.ele;

    if (i > 0) {
      const prevPt = allRawPoints[i - 1];
      const prevEle = smoothedEle[i - 1] ?? prevPt.ele;

      // True 2D surface distance (standard Great Circle / Haversine distance used by Garmin/Strava/Mapy.cz)
      const d2d = calculateDistanceKm(prevPt.lat, prevPt.lng, pt.lat, pt.lng);

      // Time delta between consecutive points
      let dtSecs: number | null = null;
      if (prevPt.timestampMs && pt.timestampMs) {
        dtSecs = (pt.timestampMs - prevPt.timestampMs) / 1000;
      }

      // Calculate speed in km/h if valid time delta
      const speedKmh = dtSecs && dtSecs > 0 ? d2d / (dtSecs / 3600) : null;

      // Filter extreme GPS teleport glitches (> 150 km/h)
      const isGlitch = speedKmh !== null && speedKmh > 150;

      // Accumulate 2D distance for all legitimate movements (> 0.2 meters apart, no teleport)
      // We do NOT discard slow walking speeds (< 0.6 km/h) so city strolls and slow climbs are fully preserved!
      if (!isGlitch && d2d >= 0.0002) {
        totalDistanceKm += d2d;
      }

      // Accumulate moving duration if user is actively moving (speed >= 0.3 km/h, gap < 10 mins)
      if (dtSecs && dtSecs > 0 && dtSecs < 600) {
        if (speedKmh === null || (speedKmh >= 0.3 && speedKmh <= 120)) {
          movingDurationSeconds += dtSecs;
        }
      }

      // Elevation Gain and Loss with deadband of 1.2m on smoothed elevation to avoid sensor noise
      if (currentEle !== undefined && prevEle !== undefined) {
        const diff = currentEle - prevEle;
        if (diff > 1.2) {
          elevationGainM += diff;
        } else if (diff < -1.2) {
          elevationLossM += Math.abs(diff);
        }
      }
    }

    trackPoints.push({
      lat: pt.lat,
      lng: pt.lng,
      ele: pt.ele !== undefined ? Math.round(pt.ele) : undefined,
      time: pt.time,
      distFromStartKm: Math.round(totalDistanceKm * 100) / 100,
    });
  }

  // If Garmin or Strava wrote an embedded odometer distance on the last point, prefer it if plausible
  const lastPt = allRawPoints[allRawPoints.length - 1];
  if (lastPt?.embeddedDistMeters && lastPt.embeddedDistMeters > 50) {
    const garminDistKm = lastPt.embeddedDistMeters / 1000;
    // Verify agreement within 25% to ensure it's not corrupt or lap-based
    if (Math.abs(garminDistKm - totalDistanceKm) / Math.max(1, totalDistanceKm) < 0.25) {
      totalDistanceKm = garminDistKm;
    }
  }

  // Calculate Duration:
  let totalElapsedSeconds = 0;
  if (firstTimestamp && lastTimestamp) {
    totalElapsedSeconds = Math.max(0, (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000);
  }

  let finalTotalDurationSeconds = 0;
  let finalMovingDurationSeconds = 0;

  if (totalElapsedSeconds >= 60) {
    finalTotalDurationSeconds = totalElapsedSeconds;
  } else if (movingDurationSeconds >= 60) {
    finalTotalDurationSeconds = movingDurationSeconds;
  } else {
    // If GPX has no timestamps (e.g. exported planned route from Mapy.cz),
    // estimate realistic hiking time via Naismith's Rule: 4 km/h horizontal + 600m/h vertical
    const estimatedHours = totalDistanceKm / 4.0 + elevationGainM / 600.0;
    finalTotalDurationSeconds = Math.max(1800, Math.round(estimatedHours * 3600));
  }

  if (movingDurationSeconds >= 60) {
    finalMovingDurationSeconds = movingDurationSeconds;
  }

  const durationStr = formatDurationFromSeconds(finalTotalDurationSeconds);
  const movingDurationStr =
    finalMovingDurationSeconds >= 60 && Math.abs(finalMovingDurationSeconds - finalTotalDurationSeconds) >= 60
      ? formatDurationFromSeconds(finalMovingDurationSeconds)
      : undefined;

  // Extract activity date from first trackpoint timestamp or metadata
  const activityDate = firstTimestamp
    ? firstTimestamp.toISOString().split('T')[0]
    : metadataDate;

  const detectedRange = detectMountainRange(trackPoints);

  return {
    trackPoints,
    distanceKm: Math.round(totalDistanceKm * 10) / 10,
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    minElevationM: minElevationM !== Number.POSITIVE_INFINITY ? Math.round(minElevationM) : 0,
    maxElevationM: maxElevationM !== Number.NEGATIVE_INFINITY ? Math.round(maxElevationM) : 0,
    detectedRange,
    name,
    duration: durationStr,
    movingDuration: movingDurationStr,
    durationMinutes: Math.round(finalTotalDurationSeconds / 60),
    movingDurationMinutes: finalMovingDurationSeconds ? Math.round(finalMovingDurationSeconds / 60) : undefined,
    date: activityDate,
    startTime: firstTimestamp ? firstTimestamp.toISOString() : undefined,
    endTime: lastTimestamp ? lastTimestamp.toISOString() : undefined,
  };
}

/**
 * Automatically detects mountain range based on track point coordinates.
 */
export function detectMountainRange(points: GPXTrackPoint[]): string | undefined {
  if (!points || points.length === 0) return undefined;

  // Calculate center of mass of the track
  let sumLat = 0;
  let sumLng = 0;
  points.forEach((p) => {
    sumLat += p.lat;
    sumLng += p.lng;
  });
  const avgLat = sumLat / points.length;
  const avgLng = sumLng / points.length;

  const ranges: {
    name: string;
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }[] = [
    // Krkonoše
    { name: 'Krkonoše', minLat: 50.60, maxLat: 50.86, minLng: 15.38, maxLng: 15.95 },
    // Jizerské hory
    { name: 'Jizerské hory', minLat: 50.75, maxLat: 50.96, minLng: 15.08, maxLng: 15.42 },
    // Lužické hory / České Švýcarsko
    { name: 'České Švýcarsko a Lužické hory', minLat: 50.76, maxLat: 50.96, minLng: 14.18, maxLng: 14.78 },
    // Krušné hory
    { name: 'Krušné hory', minLat: 50.25, maxLat: 50.82, minLng: 12.38, maxLng: 14.12 },
    // Šumava
    { name: 'Šumava', minLat: 48.65, maxLat: 49.36, minLng: 13.00, maxLng: 14.20 },
    // Český les
    { name: 'Český les', minLat: 49.30, maxLat: 50.05, minLng: 12.35, maxLng: 12.90 },
    // Jeseníky (Hrubý & Nízký)
    { name: 'Jeseníky', minLat: 49.92, maxLat: 50.36, minLng: 17.00, maxLng: 17.72 },
    // Rychlebské hory
    { name: 'Rychlebské hory', minLat: 50.18, maxLat: 50.48, minLng: 16.82, maxLng: 17.18 },
    // Králický Sněžník
    { name: 'Králický Sněžník', minLat: 50.08, maxLat: 50.28, minLng: 16.74, maxLng: 17.00 },
    // Orlické hory
    { name: 'Orlické hory', minLat: 50.12, maxLat: 50.46, minLng: 16.24, maxLng: 16.68 },
    // Moravskoslezské Beskydy
    { name: 'Beskydy', minLat: 49.38, maxLat: 49.66, minLng: 18.05, maxLng: 18.82 },
    // Vsetínské vrchy & Javorníky
    { name: 'Javorníky a Vsetínské vrchy', minLat: 49.24, maxLat: 49.46, minLng: 18.00, maxLng: 18.60 },
    // Bílé Karpaty
    { name: 'Bílé Karpaty', minLat: 48.84, maxLat: 49.22, minLng: 17.48, maxLng: 18.18 },
    // České středohoří
    { name: 'České středohoří', minLat: 50.48, maxLat: 50.72, minLng: 13.88, maxLng: 14.45 },
    // Brdy
    { name: 'Brdy', minLat: 49.60, maxLat: 49.86, minLng: 13.70, maxLng: 14.18 },
    // Český ráj
    { name: 'Český ráj', minLat: 50.45, maxLat: 50.66, minLng: 15.02, maxLng: 15.38 },
    // Broumovsko
    { name: 'Broumovsko a Adršpach', minLat: 50.48, maxLat: 50.70, minLng: 16.05, maxLng: 16.45 },
    // Pálava a Jižní Morava
    { name: 'Pálava a Jižní Morava', minLat: 48.70, maxLat: 49.15, minLng: 16.30, maxLng: 17.15 },
    // Českomoravské pomezí / Litomyšlsko a Svitavsko
    { name: 'Českomoravské pomezí (Litomyšlsko)', minLat: 49.72, maxLat: 50.06, minLng: 16.15, maxLng: 16.65 },
    // Vysočina & Žďárské vrchy
    { name: 'Vysočina a Žďárské vrchy', minLat: 49.25, maxLat: 49.80, minLng: 15.30, maxLng: 16.15 },
    // Pardubicko a Polabí
    { name: 'Pardubicko a Polabí', minLat: 49.95, maxLat: 50.25, minLng: 15.45, maxLng: 16.15 },
    // Moravský kras a Drahanská vrchovina
    { name: 'Moravský kras a Drahanská vrchovina', minLat: 49.25, maxLat: 49.60, minLng: 16.55, maxLng: 17.00 },
    // Chřiby a Hostýnské vrchy
    { name: 'Chřiby a Hostýnské vrchy', minLat: 49.05, maxLat: 49.40, minLng: 17.15, maxLng: 17.85 },
    // Praha a okolí
    { name: 'Praha a okolí', minLat: 49.95, maxLat: 50.20, minLng: 14.20, maxLng: 14.70 },
    // Střední Čechy
    { name: 'Střední Čechy', minLat: 49.50, maxLat: 50.45, minLng: 13.80, maxLng: 15.40 },

    // Slovensko
    // Vysoké Tatry
    { name: 'Vysoké Tatry', minLat: 49.10, maxLat: 49.26, minLng: 19.90, maxLng: 20.30 },
    // Západné Tatry (Roháče)
    { name: 'Západné Tatry (Roháče)', minLat: 49.14, maxLat: 49.29, minLng: 19.58, maxLng: 19.92 },
    // Belianske Tatry
    { name: 'Belianske Tatry', minLat: 49.22, maxLat: 49.30, minLng: 20.20, maxLng: 20.35 },
    // Nízke Tatry
    { name: 'Nízke Tatry', minLat: 48.84, maxLat: 49.06, minLng: 19.28, maxLng: 20.28 },
    // Malá Fatra
    { name: 'Malá Fatra', minLat: 49.08, maxLat: 49.32, minLng: 18.88, maxLng: 19.26 },
    // Veľká Fatra
    { name: 'Veľká Fatra', minLat: 48.84, maxLat: 49.16, minLng: 18.94, maxLng: 19.32 },
    // Chočské vrchy
    { name: 'Chočské vrchy', minLat: 49.10, maxLat: 49.22, minLng: 19.24, maxLng: 19.52 },
    // Slovenský raj
    { name: 'Slovenský raj', minLat: 48.84, maxLat: 49.02, minLng: 20.24, maxLng: 20.56 },

    // Alpy & Rakousko
    // Vídeňské Alpy (Rax, Schneeberg, Semmering, Hohen Wand, Gutensteiner Alpen)
    { name: 'Vídeňské Alpy (Rax / Schneeberg / Hohen Wand)', minLat: 47.50, maxLat: 48.15, minLng: 15.50, maxLng: 16.35 },
    // Mürzsteger Alpen & Hochschwab
    { name: 'Hochschwab & Mürzsteger Alpen', minLat: 47.45, maxLat: 47.85, minLng: 14.95, maxLng: 15.65 },
    // Ennstalské Alpy / Gesäuse
    { name: 'Ennstalské Alpy (Gesäuse)', minLat: 47.45, maxLat: 47.75, minLng: 14.35, maxLng: 14.95 },
    // Totes Gebirge, Dachstein a Solná komora (Salzkammergut)
    { name: 'Dachstein a Salzkammergut', minLat: 47.40, maxLat: 47.90, minLng: 13.40, maxLng: 14.35 },
    // Berchtesgadenské Alpy
    { name: 'Berchtesgadenské Alpy', minLat: 47.40, maxLat: 47.78, minLng: 12.60, maxLng: 13.25 },
    // Vysoké Taury (Hohe Tauern)
    { name: 'Vysoké Taury (Hohe Tauern)', minLat: 46.85, maxLat: 47.35, minLng: 11.90, maxLng: 13.60 },
    // Nízké Taury (Niedere Tauern)
    { name: 'Nízké Taury (Niedere Tauern)', minLat: 47.05, maxLat: 47.55, minLng: 13.45, maxLng: 14.90 },
    // Zillertalské a Ötztalské Alpy (Tyrolsko)
    { name: 'Tyrolské Alpy (Zillertal / Ötztal)', minLat: 46.80, maxLat: 47.45, minLng: 10.70, maxLng: 12.20 },
    // Dolomity (Itálie)
    { name: 'Dolomity (Itálie)', minLat: 46.15, maxLat: 46.80, minLng: 11.45, maxLng: 12.65 },
    // Julské Alpy
    { name: 'Julské Alpy (Slovinsko)', minLat: 46.15, maxLat: 46.55, minLng: 13.35, maxLng: 14.30 },
    // Kamnicko-Savinjské Alpy
    { name: 'Kamnicko-Savinjské Alpy (Slovinsko)', minLat: 46.25, maxLat: 46.48, minLng: 14.35, maxLng: 14.85 },
    // Všechny ostatní Alpy v Rakousku
    { name: 'Alpy (Rakousko)', minLat: 46.30, maxLat: 48.30, minLng: 9.50, maxLng: 16.50 },
  ];

  for (const range of ranges) {
    if (
      avgLat >= range.minLat &&
      avgLat <= range.maxLat &&
      avgLng >= range.minLng &&
      avgLng <= range.maxLng
    ) {
      return range.name;
    }
  }

  // Country-level fallbacks based on geographic borders
  if (avgLat >= 46.35 && avgLat <= 49.02 && avgLng >= 9.53 && avgLng <= 17.16) {
    return 'Rakousko (Alpy)';
  }
  if (avgLat >= 47.73 && avgLat <= 49.61 && avgLng >= 16.83 && avgLng <= 22.56) {
    return 'Slovensko';
  }
  if (avgLat >= 45.40 && avgLat <= 46.88 && avgLng >= 13.35 && avgLng <= 16.61) {
    return 'Slovinsko';
  }
  if (avgLat >= 36.50 && avgLat <= 47.10 && avgLng >= 6.60 && avgLng <= 18.60) {
    return 'Itálie';
  }
  if (avgLat >= 47.25 && avgLat <= 55.05 && avgLng >= 5.85 && avgLng <= 15.05) {
    return 'Německo';
  }
  if (avgLat >= 49.00 && avgLat <= 54.85 && avgLng >= 14.10 && avgLng <= 24.15) {
    return 'Polsko';
  }
  if (avgLat >= 42.35 && avgLat <= 46.55 && avgLng >= 13.45 && avgLng <= 19.45) {
    return 'Chorvatsko';
  }
  if (avgLat >= 48.55 && avgLat <= 51.05 && avgLng >= 12.09 && avgLng <= 18.86) {
    return 'Česká republika';
  }

  return undefined;
}

/**
 * Builds a valid GPX 1.1 XML string from track points.
 */
export function buildGPXXml(
  trackName: string,
  points: GPXTrackPoint[]
): string {
  const pointsXml = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${
          p.ele !== undefined ? `\n        <ele>${p.ele}</ele>` : ''
        }${p.time ? `\n        <time>${p.time}</time>` : ''}\n      </trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Horský Deník" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(trackName)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${pointsXml}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * Triggers a client-side file download of the GPX.
 */
export function downloadGPXFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
