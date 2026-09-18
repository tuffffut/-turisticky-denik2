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
}

/**
 * Parses raw GPX XML string into structured trackpoints and statistics.
 * Computes elevation gain from every point in the track with moving-average noise smoothing.
 */
export function parseGPX(xmlString: string): ParsedGPXResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('Neplatný formát GPX souboru.');
  }

  let rawPoints: Element[] = Array.from(xmlDoc.getElementsByTagName('trkpt'));
  if (rawPoints.length === 0) {
    rawPoints = Array.from(xmlDoc.getElementsByTagName('rtept'));
  }
  if (rawPoints.length === 0) {
    rawPoints = Array.from(xmlDoc.getElementsByTagName('wpt'));
  }

  if (rawPoints.length === 0) {
    throw new Error('V GPX souboru nebyly nalezeny žádné body trasy (trkpt/rtept/wpt).');
  }

  const nameTag = xmlDoc.getElementsByTagName('name')[0];
  const name = nameTag ? nameTag.textContent || undefined : undefined;

  // 1. Extract coordinates and raw elevations
  const rawData: { lat: number; lng: number; ele?: number; time?: string }[] = [];
  let minElevationM = Number.POSITIVE_INFINITY;
  let maxElevationM = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lng = parseFloat(pt.getAttribute('lon') || '0');

    const eleNode = pt.getElementsByTagName('ele')[0];
    const ele = eleNode ? parseFloat(eleNode.textContent || '0') : undefined;

    const timeNode = pt.getElementsByTagName('time')[0];
    const time = timeNode ? timeNode.textContent || undefined : undefined;

    if (ele !== undefined && !isNaN(ele)) {
      if (ele < minElevationM) minElevationM = ele;
      if (ele > maxElevationM) maxElevationM = ele;
    }

    rawData.push({ lat, lng, ele, time });
  }

  // 2. Smooth elevations slightly using a 3-point window to remove microscopic GPS sensor flutter
  // but preserve EVERY genuine elevation gain from every point
  const smoothedEle: (number | undefined)[] = rawData.map((pt, i, arr) => {
    if (pt.ele === undefined) return undefined;
    const prev = arr[i - 1]?.ele;
    const next = arr[i + 1]?.ele;
    if (prev !== undefined && next !== undefined) {
      return (prev + pt.ele + next) / 3;
    }
    return pt.ele;
  });

  const trackPoints: GPXTrackPoint[] = [];
  let totalDistanceKm = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  for (let i = 0; i < rawData.length; i++) {
    const pt = rawData[i];
    const currentEle = smoothedEle[i] ?? pt.ele;

    if (i > 0) {
      const prevPt = rawData[i - 1];
      const dist = calculateDistanceKm(prevPt.lat, prevPt.lng, pt.lat, pt.lng);
      totalDistanceKm += dist;

      const prevEle = smoothedEle[i - 1] ?? prevPt.ele;
      if (currentEle !== undefined && prevEle !== undefined) {
        const diff = currentEle - prevEle;
        // Compute gain and loss from every point
        if (diff > 0) {
          elevationGainM += diff;
        } else if (diff < 0) {
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
    // Pálava
    { name: 'Pálava', minLat: 48.80, maxLat: 48.92, minLng: 16.60, maxLng: 16.75 },

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

    // Alpy / Rakousko / Itálie
    { name: 'Alpy (Rakousko / Itálie)', minLat: 46.00, maxLat: 47.85, minLng: 9.50, maxLng: 16.00 },
    // Julské Alpy
    { name: 'Julské Alpy (Slovinsko)', minLat: 46.15, maxLat: 46.52, minLng: 13.40, maxLng: 14.50 },
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

  // Fallback if inside Czech Republic
  if (avgLat >= 48.55 && avgLat <= 51.05 && avgLng >= 12.09 && avgLng <= 18.86) {
    return 'Česko';
  }
  // Fallback if inside Slovakia
  if (avgLat >= 47.73 && avgLat <= 49.61 && avgLng >= 16.83 && avgLng <= 22.56) {
    return 'Slovensko';
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
