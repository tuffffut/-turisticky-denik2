export interface GpxTrackpoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: string;
  distFromStartKm?: number;
}

export interface HikePhotoItem {
  id: string;
  url: string;
  rawUrl?: string;
  dataUrl?: string;
  name?: string;
  caption?: string;
  width?: number;
  height?: number;
  sizeKb?: number;
  createdAt?: string;
}

export type ActivityType = 'hiking' | 'ferrata' | 'trail_running' | 'winter' | 'biking';

export interface HikeRoute {
  id: string;
  title: string;
  date: string;
  mountainRange: string;
  activityType: ActivityType;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  highestPointM: number;
  duration?: string;
  description?: string;
  rating?: number;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'extreme';
  externalAlbumUrl?: string;
  photos?: (string | HikePhotoItem)[];
  trackpoints?: GpxTrackpoint[];
  gpxXml?: string;
  startPoint?: { lat: number; lng: number };
  endPoint?: { lat: number; lng: number };
  highestPointCoords?: { lat: number; lng: number; ele: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface HikeStats {
  totalHikes: number;
  totalDistanceKm: number;
  totalElevationM: number;
  highestElevationM: number;
  mountainRangesCount: number;
}
