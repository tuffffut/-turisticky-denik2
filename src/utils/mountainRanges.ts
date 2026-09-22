/**
 * Mountain Range and Hiking Region Detector.
 * Provides accurate geo-bounding boxes for mountain ranges, hilly regions,
 * and popular hiking areas in the Czech Republic, Slovakia, and the Alps.
 */

export interface MountainRegionDef {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  priority?: number;
}

export const POPULAR_MOUNTAIN_RANGES: string[] = [
  'Krkonoše',
  'Jizerské hory',
  'České Švýcarsko a Lužické hory',
  'Krušné hory',
  'Šumava',
  'Český les',
  'Jeseníky',
  'Rychlebské hory',
  'Králický Sněžník',
  'Orlické hory',
  'Beskydy',
  'Javorníky a Vsetínské vrchy',
  'Bílé Karpaty',
  'České středohoří',
  'Brdy a Křivoklátsko',
  'Český ráj',
  'Broumovsko a Adršpach',
  'Moravský kras',
  'Brno a okolí',
  'Pálava a Jižní Morava',
  'Vysočina a Žďárské vrchy',
  'Českomoravské pomezí (Litomyšlsko)',
  'Pardubicko a Polabí',
  'Haná a Střední Morava',
  'Chřiby a Hostýnské vrchy',
  'Praha a okolí',
  'Střední Čechy',
  'Vysoké Tatry',
  'Západné Tatry (Roháče)',
  'Belianske Tatry',
  'Nízke Tatry',
  'Malá Fatra',
  'Veľká Fatra',
  'Chočské vrchy',
  'Slovenský raj',
  'Vídeňské Alpy (Rax)',
  'Vídeňské Alpy (Schneeberg)',
  'Vídeňské Alpy (Hohen Wand)',
  'Hochschwab & Mürzsteger Alpen',
  'Ennstalské Alpy (Gesäuse)',
  'Dachstein a Salzkammergut',
  'Berchtesgadenské Alpy',
  'Vysoké Taury (Hohe Tauern)',
  'Nízké Taury (Niedere Tauern)',
  'Tyrolské Alpy (Zillertal / Ötztal)',
  'Dolomity (Itálie)',
  'Julské Alpy (Slovinsko)',
  'Kamnicko-Savinjské Alpy (Slovinsko)',
  'Alpy (Rakousko)',
  'Česká republika (výlet)',
];

export const MOUNTAIN_REGIONS: MountainRegionDef[] = [
  // 1. Czech Mountain Ranges (high priority)
  { name: 'Krkonoše', minLat: 50.55, maxLat: 50.88, minLng: 15.35, maxLng: 15.95 },
  { name: 'Jizerské hory', minLat: 50.66, maxLat: 50.98, minLng: 14.95, maxLng: 15.45 },
  { name: 'České Švýcarsko a Lužické hory', minLat: 50.76, maxLat: 50.96, minLng: 14.18, maxLng: 14.88 },
  { name: 'Krušné hory', minLat: 50.25, maxLat: 50.85, minLng: 12.35, maxLng: 14.15 },
  { name: 'Šumava', minLat: 48.65, maxLat: 49.36, minLng: 13.00, maxLng: 14.20 },
  { name: 'Český les a Slavkovský les', minLat: 49.30, maxLat: 50.18, minLng: 12.35, maxLng: 12.95 },
  { name: 'Jeseníky', minLat: 49.80, maxLat: 50.36, minLng: 16.95, maxLng: 17.75 },
  { name: 'Rychlebské hory', minLat: 50.18, maxLat: 50.48, minLng: 16.82, maxLng: 17.18 },
  { name: 'Králický Sněžník', minLat: 50.08, maxLat: 50.28, minLng: 16.74, maxLng: 17.00 },
  { name: 'Orlické hory', minLat: 50.12, maxLat: 50.46, minLng: 16.24, maxLng: 16.68 },
  { name: 'Beskydy', minLat: 49.38, maxLat: 49.66, minLng: 18.05, maxLng: 18.85 },
  { name: 'Javorníky a Vsetínské vrchy', minLat: 49.24, maxLat: 49.46, minLng: 17.95, maxLng: 18.60 },
  { name: 'Bílé Karpaty', minLat: 48.84, maxLat: 49.22, minLng: 17.48, maxLng: 18.18 },
  { name: 'České středohoří', minLat: 50.48, maxLat: 50.75, minLng: 13.88, maxLng: 14.45 },
  { name: 'Brdy a Křivoklátsko', minLat: 49.60, maxLat: 50.05, minLng: 13.65, maxLng: 14.18 },
  { name: 'Český ráj', minLat: 50.45, maxLat: 50.66, minLng: 15.02, maxLng: 15.38 },
  { name: 'Broumovsko a Adršpach', minLat: 50.48, maxLat: 50.70, minLng: 16.05, maxLng: 16.45 },

  // 2. Specific Czech Regional Hiking & Protected Areas
  // Moravský kras (Adamov, Blansko, Sloup, Jedovnice, Lipovec, Macocha)
  { name: 'Moravský kras', minLat: 49.26, maxLat: 49.45, minLng: 16.65, maxLng: 16.88 },
  // Brno a okolí (Brno, Vranov, Tišnov, Kanice, Lelekovice, Čebín, Javůrek, Kuřim, Moravany, Mokrá, Slavkov, Vyškov, Luleč)
  { name: 'Brno a okolí', minLat: 49.12, maxLat: 49.38, minLng: 16.32, maxLng: 17.05 },
  // Pálava a Jižní Morava (Mikulov, Pavlov, Podyjí, Znojmo, Vranov nad Dyjí, Bítov, Vranovská přehrada, Lednice, Břeclav)
  { name: 'Pálava a Jižní Morava', minLat: 48.60, maxLat: 49.12, minLng: 15.40, maxLng: 17.30 },
  // Vysočina a Žďárské vrchy (Žďár, Vír, Jihlava, Želiv, Sedlice, Mohelno, Hartvíkovice, Dalešice, Třebíč)
  { name: 'Vysočina a Žďárské vrchy', minLat: 49.10, maxLat: 49.85, minLng: 15.15, maxLng: 16.35 },
  // Českomoravské pomezí (Litomyšl, Svitavy, Polička, Toulovcovy maštale)
  { name: 'Českomoravské pomezí (Litomyšlsko)', minLat: 49.70, maxLat: 50.08, minLng: 16.15, maxLng: 16.70 },
  // Pardubicko a Polabí
  { name: 'Pardubicko a Polabí', minLat: 49.95, maxLat: 50.25, minLng: 15.35, maxLng: 16.15 },
  // Haná a Střední Morava (Olomouc, Prostějov, Kroměříž, Přerov)
  { name: 'Haná a Střední Morava', minLat: 49.35, maxLat: 49.75, minLng: 16.95, maxLng: 17.55 },
  // Chřiby a Hostýnské vrchy
  { name: 'Chřiby a Hostýnské vrchy', minLat: 49.05, maxLat: 49.45, minLng: 17.15, maxLng: 17.85 },
  // Praha a okolí
  { name: 'Praha a okolí', minLat: 49.95, maxLat: 50.20, minLng: 14.20, maxLng: 14.70 },
  // Střední Čechy
  { name: 'Střední Čechy', minLat: 49.40, maxLat: 50.50, minLng: 13.80, maxLng: 15.40 },

  // 3. Slovakia
  { name: 'Vysoké Tatry', minLat: 49.10, maxLat: 49.26, minLng: 19.90, maxLng: 20.30 },
  { name: 'Západné Tatry (Roháče)', minLat: 49.14, maxLat: 49.29, minLng: 19.58, maxLng: 19.92 },
  { name: 'Belianske Tatry', minLat: 49.22, maxLat: 49.30, minLng: 20.20, maxLng: 20.35 },
  { name: 'Nízke Tatry', minLat: 48.84, maxLat: 49.06, minLng: 19.28, maxLng: 20.28 },
  { name: 'Malá Fatra', minLat: 49.08, maxLat: 49.32, minLng: 18.88, maxLng: 19.26 },
  { name: 'Veľká Fatra', minLat: 48.84, maxLat: 49.16, minLng: 18.94, maxLng: 19.32 },
  { name: 'Chočské vrchy', minLat: 49.10, maxLat: 49.22, minLng: 19.24, maxLng: 19.52 },
  { name: 'Slovenský raj', minLat: 48.84, maxLat: 49.02, minLng: 20.24, maxLng: 20.56 },

  // 4. Alps & Neighbors
  { name: 'Vídeňské Alpy (Rax)', minLat: 47.65, maxLat: 47.78, minLng: 15.65, maxLng: 15.85 },
  { name: 'Vídeňské Alpy (Schneeberg)', minLat: 47.72, maxLat: 47.82, minLng: 15.78, maxLng: 15.92 },
  { name: 'Vídeňské Alpy (Hohen Wand)', minLat: 47.80, maxLat: 47.92, minLng: 15.95, maxLng: 16.15 },
  { name: 'Vídeňské Alpy (Rax / Schneeberg / Hohen Wand)', minLat: 47.50, maxLat: 48.15, minLng: 15.50, maxLng: 16.35 },
  { name: 'Hochschwab & Mürzsteger Alpen', minLat: 47.45, maxLat: 47.85, minLng: 14.95, maxLng: 15.65 },
  { name: 'Ennstalské Alpy (Gesäuse)', minLat: 47.45, maxLat: 47.75, minLng: 14.35, maxLng: 14.95 },
  { name: 'Dachstein a Salzkammergut', minLat: 47.40, maxLat: 47.90, minLng: 13.40, maxLng: 14.35 },
  { name: 'Berchtesgadenské Alpy', minLat: 47.40, maxLat: 47.78, minLng: 12.60, maxLng: 13.25 },
  { name: 'Vysoké Taury (Hohe Tauern)', minLat: 46.85, maxLat: 47.35, minLng: 11.90, maxLng: 13.60 },
  { name: 'Nízké Taury (Niedere Tauern)', minLat: 47.05, maxLat: 47.55, minLng: 13.45, maxLng: 14.90 },
  { name: 'Tyrolské Alpy (Zillertal / Ötztal)', minLat: 46.80, maxLat: 47.45, minLng: 10.70, maxLng: 12.20 },
  { name: 'Dolomity (Itálie)', minLat: 46.15, maxLat: 46.80, minLng: 11.45, maxLng: 12.65 },
  { name: 'Julské Alpy (Slovinsko)', minLat: 46.15, maxLat: 46.55, minLng: 13.35, maxLng: 14.30 },
  { name: 'Kamnicko-Savinjské Alpy (Slovinsko)', minLat: 46.25, maxLat: 46.48, minLng: 14.35, maxLng: 14.85 },
  { name: 'Alpy (Rakousko)', minLat: 46.30, maxLat: 48.30, minLng: 9.50, maxLng: 16.50 },
];

/**
 * Detects the mountain range or regional area from latitude and longitude.
 * CRITICAL: Always checks Czech Republic boundary FIRST before Poland so that
 * Brno, Moravia, and Czech locations can NEVER be accidentally marked as Poland.
 */
export function detectMountainRangeFromCoords(lat: number, lng: number): string {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return 'Aktivita v terénu';
  }

  // 1. Check specific geographic bounding boxes
  for (const reg of MOUNTAIN_REGIONS) {
    if (lat >= reg.minLat && lat <= reg.maxLat && lng >= reg.minLng && lng <= reg.maxLng) {
      return reg.name;
    }
  }

  // 2. Czech Republic overall bounding box - checked FIRST before Poland!
  // South: 48.55, North: 51.06, West: 12.09, East: 18.86
  if (lat >= 48.55 && lat <= 51.06 && lng >= 12.09 && lng <= 18.86) {
    // If in Moravia/Brno corridor
    if (lng >= 16.20 && lng <= 17.50 && lat >= 48.90 && lat <= 49.60) {
      return 'Brno a okolí';
    }
    return 'Česká republika (výlet)';
  }

  // 3. Country-level fallbacks based on international borders
  // Austria (Alps)
  if (lat >= 46.35 && lat <= 49.02 && lng >= 9.53 && lng <= 17.16) {
    return 'Alpy (Rakousko)';
  }
  // Slovakia
  if (lat >= 47.73 && lat <= 49.61 && lng >= 16.83 && lng <= 22.56) {
    return 'Slovensko';
  }
  // Slovenia
  if (lat >= 45.40 && lat <= 46.88 && lng >= 13.35 && lng <= 16.61) {
    return 'Slovinsko';
  }
  // Italy
  if (lat >= 36.50 && lat <= 47.10 && lng >= 6.60 && lng <= 18.60) {
    return 'Itálie';
  }
  // Germany
  if (lat >= 47.25 && lat <= 55.05 && lng >= 5.85 && lng <= 15.05) {
    return 'Německo';
  }
  // Croatia
  if (lat >= 42.35 && lat <= 46.55 && lng >= 13.45 && lng <= 19.45) {
    return 'Chorvatsko';
  }
  // Poland - ONLY if strictly north of Czech border (lat > 50.85 or east of Beskydy lat > 49.85 & lng > 18.86)
  const isTrulyPoland =
    (lat >= 50.85 && lat <= 54.85 && lng >= 14.10 && lng <= 24.15) ||
    (lat >= 49.85 && lat <= 54.85 && lng > 18.86 && lng <= 24.15);
  if (isTrulyPoland) {
    return 'Polsko';
  }

  return 'Zahraničí';
}

/**
 * Checks if a hike's current mountainRange is suspicious.
 * Catches cases where a Czech hike was misassigned to Poland, Slovakia, Germany, Austria/Alps,
 * or generic labels like 'Zahraničí' or 'Aktivita v terénu'.
 */
export function isSuspectMountainRange(currentRange: string | undefined, lat?: number, lng?: number): boolean {
  if (!currentRange || !currentRange.trim()) return true;
  if (!lat || !lng) return false;

  const isCzechCoords = lat >= 48.55 && lat <= 51.06 && lng >= 12.09 && lng <= 18.86;
  const lower = currentRange.toLowerCase().trim();

  if (isCzechCoords) {
    if (
      lower === 'polsko' ||
      lower === 'slovensko' ||
      lower === 'německo' ||
      lower === 'nemecko' ||
      lower.includes('alp') ||
      lower === 'zahraničí' ||
      lower === 'zahranici' ||
      lower === 'aktivita v terénu' ||
      lower === 'historická výprava'
    ) {
      return true; // Clearly erroneous assignment for coordinates in Czech Republic
    }
  }

  const detected = detectMountainRangeFromCoords(lat, lng);
  if (lower === 'polsko' && detected !== 'Polsko') {
    return true;
  }

  return false;
}
