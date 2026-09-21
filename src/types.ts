export type UserRole = 'admin' | 'reader';

export type HikeDifficulty = 'easy' | 'moderate' | 'hard' | 'ferrata';

export interface GPXTrackPoint {
  lat: number;
  lng: number;
  ele?: number; // meters above sea level
  time?: string;
  distFromStartKm?: number;
}

export interface HikeVideo {
  id: string;
  url: string;
  title?: string;
  platform: 'youtube' | 'vimeo' | 'mp4';
}

export interface HikeAISummary {
  story?: string;
  oneLiner?: string;
  rawNotesOriginal?: string;
  safety?: string;
  highlights?: string;
  gear?: string[];
  bestSeason?: string;
  weatherTips?: string;
  generatedAt: string;
}

export interface MountainHike {
  id: string;
  title: string;
  mountainRange: string;
  date: string; // YYYY-MM-DD
  distanceKm: number;
  elevationGainM: number;
  elevationLossM?: number;
  duration: string; // e.g. "5h 30m" (celkový čas / elapsed)
  movingDuration?: string; // e.g. "4h 15m" (aktivní čas / čas v pohybu)
  difficulty?: HikeDifficulty;
  rating?: number; // 1 to 5 (optional, unrated if undefined)
  description: string;
  photos: string[];
  videos?: HikeVideo[];
  aiSummary?: HikeAISummary;
  highestPointM?: number;
  lowestPointM?: number;
  peakCoords: {
    lat: number;
    lng: number;
    name?: string;
  };
  trackPoints?: GPXTrackPoint[];
  gpxRawXml?: string;
  hutsAndWaypoints?: string[];
  weather?: string;
}

export interface PinConfig {
  adminPin: string;
  readerPin: string;
}

export interface AppStats {
  totalDistanceKm: number;
  totalElevationM: number;
  totalHikes: number;
  highestPeakM: number;
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  webhookSecret?: string;
  isEnabled?: boolean;
}
