import React from 'react';
import {
  Calendar,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Star,
  MapPin,
  Edit2,
  Trash2,
  Compass,
  ArrowRight,
  Video,
  CloudSun,
  Download,
  Camera,
} from 'lucide-react';
import { MountainHike, UserRole } from '../types';
import { formatDateDisplay } from '../utils/dateUtils';
import { downloadGPXFile, buildGPXXml } from '../utils/gpxParser';

interface HikeCardProps {
  hike: MountainHike;
  currentRole: UserRole;
  onSelect: (hike: MountainHike) => void;
  onEdit: (hike: MountainHike) => void;
  onDelete: (hikeId: string) => void;
  onRequestDelete?: (hike: MountainHike) => void;
}

export const HikeCard: React.FC<HikeCardProps> = ({
  hike,
  currentRole,
  onSelect,
  onEdit,
  onDelete,
  onRequestDelete,
}) => {
  const isAdmin = currentRole === 'admin';
  const hasGpx = Boolean(hike.gpxRawXml || (hike.trackPoints && hike.trackPoints.length > 0));

  const handleDownloadGPX = (e: React.MouseEvent) => {
    e.stopPropagation();
    let xmlContent = hike.gpxRawXml;
    if (!xmlContent && hike.trackPoints && hike.trackPoints.length > 0) {
      xmlContent = buildGPXXml(hike.title, hike.trackPoints);
    }
    if (xmlContent) {
      const safeFilename = hike.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 30);
      downloadGPXFile(`${safeFilename || 'trasa'}.gpx`, xmlContent);
    }
  };

  const getDifficultyBadge = (difficulty?: string) => {
    if (!difficulty) return null;
    switch (difficulty) {
      case 'easy':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-sm">
            Lehká
          </span>
        );
      case 'moderate':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60 shadow-sm">
            Střední
          </span>
        );
      case 'hard':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60 shadow-sm">
            Těžká
          </span>
        );
      case 'ferrata':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-950/90 text-violet-300 border border-violet-700/80 shadow-sm flex items-center gap-1">
            <span>🧗 Ferrata</span>
          </span>
        );
      case 'climbing':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/90 text-rose-300 border border-rose-700/80 shadow-sm flex items-center gap-1">
            <span>🧗 Lezení</span>
          </span>
        );
      default:
        return null;
    }
  };

  const hasPhotos = Boolean(hike.photos && hike.photos.length > 0);
  const hasRating = typeof hike.rating === 'number' && hike.rating > 0;

  return (
    <div
      id={`hike-card-${hike.id}`}
      className={`group relative flex flex-col rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${
        hasPhotos
          ? 'bg-stone-900/90 border border-stone-800/80 hover:border-emerald-500/40'
          : 'bg-stone-900 border-2 border-amber-600/35 hover:border-amber-400/80 ring-1 ring-amber-500/20'
      }`}
    >
      {/* Cover Image & Overlays */}
      <div
        className="relative h-44 sm:h-48 w-full overflow-hidden bg-stone-950 cursor-pointer select-none"
        onClick={() => onSelect(hike)}
      >
        {hasPhotos ? (
          <>
            <img
              src={hike.photos[0]}
              alt={hike.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-stone-900 via-stone-850 to-stone-900 border-b border-stone-800/70">
            <div className="w-12 h-12 rounded-2xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-center text-amber-400 mb-2 shadow-inner group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-stone-300 font-semibold text-xs tracking-wide uppercase line-clamp-1 max-w-[220px] text-center">
              {hike.mountainRange || 'Aktivita'}
            </span>
            <span className="text-stone-500 text-[11px] font-mono mt-0.5">
              {hike.distanceKm} km {hike.duration ? `• ${hike.duration}` : ''}
            </span>
          </div>
        )}

        {/* Mountain Range Tag */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900/80 backdrop-blur-md text-stone-200 text-xs font-semibold border border-stone-700/60 shadow-md">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>{hike.mountainRange}</span>
        </div>

        {/* Difficulty & Activity badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {hike.activityType &&
            (hike.activityType === 'mountaineering' || hike.activityType === 'climbing') &&
            hike.difficulty !== 'climbing' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/90 text-rose-300 border border-rose-700/80 shadow-sm flex items-center gap-1">
                <span>🧗 {hike.activityType === 'mountaineering' ? 'Horolezectví' : 'Lezení'}</span>
              </span>
            )}
          {getDifficultyBadge(hike.difficulty)}
        </div>

        {/* Summit Elevation Badge if present */}
        {hike.highestPointM && (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-stone-900/90 backdrop-blur-md text-stone-200 text-xs font-mono font-medium border border-stone-800">
            ▲ {hike.highestPointM} m
          </div>
        )}

        {/* Media & AI Badges */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 flex-wrap">
          {hasPhotos ? (
            <div className="px-2 py-0.5 rounded-md bg-stone-950/80 backdrop-blur-sm text-stone-300 text-[11px] font-medium border border-stone-800/80 shadow">
              📷 {hike.photos.length} {hike.photos.length === 1 ? 'fotka' : hike.photos.length < 5 ? 'fotky' : 'fotek'}
            </div>
          ) : (
            <div className="px-2 py-0.5 rounded-md bg-stone-900/90 backdrop-blur-sm text-amber-300 text-[11px] font-medium border border-amber-600/40 shadow flex items-center gap-1">
              <Camera className="w-3 h-3 text-amber-400" />
              <span>Čeká na fotky</span>
            </div>
          )}
          {hike.videos && hike.videos.length > 0 && (
            <div className="px-2 py-0.5 rounded-md bg-sky-950/90 backdrop-blur-sm text-sky-300 text-[11px] font-medium border border-sky-800/80 shadow flex items-center gap-1">
              <Video className="w-3 h-3 text-sky-400" />
              <span>Video</span>
            </div>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Date & Rating */}
          <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-stone-500" />
              <span>
                {formatDateDisplay(hike.date, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </span>

            {/* Rating */}
            {hasRating ? (
              <div className="flex items-center gap-1" title={`Hodnocení: ${hike.rating}/5`}>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= (hike.rating || 0)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-stone-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-mono font-semibold text-amber-400">
                  {hike.rating}
                </span>
              </div>
            ) : (
              <span
                className="text-[11px] text-stone-500 font-normal italic flex items-center gap-1"
                title="Zatím nehodnoceno"
              >
                <Star className="w-3 h-3 text-stone-600" />
                <span>Nehodnoceno</span>
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            onClick={() => onSelect(hike)}
            className="text-lg font-bold text-stone-100 hover:text-emerald-400 transition-colors cursor-pointer line-clamp-1 mb-2"
          >
            {hike.title}
          </h3>

          {/* Description snippet */}
          <p className="text-stone-400 text-xs line-clamp-2 leading-relaxed mb-4">
            {hike.description}
          </p>

          {/* Metrics Pill Grid */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-stone-950/60 border border-stone-800/80 text-xs mb-4">
            <div className="flex flex-col items-center text-center">
              <span className="text-stone-500 text-[10px] uppercase tracking-wider">Trasa</span>
              <span className="font-bold text-stone-200 font-mono mt-0.5">
                {hike.distanceKm} km
              </span>
            </div>
            <div className="flex flex-col items-center text-center border-x border-stone-800">
              <span className="text-stone-500 text-[10px] uppercase tracking-wider">Převýšení</span>
              <span className="font-bold text-emerald-400 font-mono mt-0.5 flex items-center">
                +{hike.elevationGainM}m
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-stone-500 text-[10px] uppercase tracking-wider">
                {hike.movingDuration ? 'Čas celk.' : 'Čas'}
              </span>
              <span className="font-bold text-stone-200 font-mono mt-0.5">
                {hike.duration}
              </span>
              {hike.movingDuration && (
                <span className="text-[10px] text-emerald-400 font-mono leading-none mt-0.5" title="Aktivní čas v pohybu">
                  🏃 {hike.movingDuration}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-800/60 mt-auto">
          <button
            type="button"
            onClick={() => onSelect(hike)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 py-1 transition-colors cursor-pointer"
          >
            <span>Detail a GPX mapa</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="flex items-center gap-1">
            {hasGpx && (
              <button
                type="button"
                onClick={handleDownloadGPX}
                className="p-1.5 text-stone-400 hover:text-emerald-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                title="Stáhnout GPX soubor s trasou"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Admin only action buttons */}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(hike);
                  }}
                  className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                  title="Upravit túru"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRequestDelete) {
                      onRequestDelete(hike);
                    } else {
                      onDelete(hike.id);
                    }
                  }}
                  className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                  title="Smazat túru"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
