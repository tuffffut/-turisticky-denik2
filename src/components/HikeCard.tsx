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
} from 'lucide-react';
import { MountainHike, UserRole } from '../types';

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

  const getDifficultyBadge = (difficulty: string) => {
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
      default:
        return null;
    }
  };

  return (
    <div
      id={`hike-card-${hike.id}`}
      className="group relative flex flex-col bg-stone-900/90 border border-stone-800/80 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-emerald-500/40 transition-all duration-300"
    >
      {/* Cover Image & Overlays */}
      <div
        className="relative h-44 sm:h-48 w-full overflow-hidden bg-stone-950 cursor-pointer select-none"
        onClick={() => onSelect(hike)}
      >
        {hike.photos && hike.photos.length > 0 ? (
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
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900">
            <div className="w-12 h-12 rounded-2xl bg-stone-850/90 border border-stone-700/60 flex items-center justify-center text-emerald-400 mb-2 shadow-inner group-hover:scale-105 transition-transform">
              <Compass className="w-6 h-6 text-emerald-400" />
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

        {/* Difficulty badge */}
        <div className="absolute top-3 right-3">{getDifficultyBadge(hike.difficulty)}</div>

        {/* Summit Elevation Badge if present */}
        {hike.highestPointM && (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-stone-900/90 backdrop-blur-md text-stone-200 text-xs font-mono font-medium border border-stone-800">
            ▲ {hike.highestPointM} m
          </div>
        )}

        {/* Media & AI Badges */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 flex-wrap">
          {hike.photos && hike.photos.length > 0 && (
            <div className="px-2 py-0.5 rounded-md bg-stone-950/80 backdrop-blur-sm text-stone-300 text-[11px] font-medium border border-stone-800/80 shadow">
              📷 {hike.photos.length} {hike.photos.length === 1 ? 'fotka' : hike.photos.length < 5 ? 'fotky' : 'fotek'}
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
                {new Date(hike.date).toLocaleDateString('cs-CZ', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </span>

            {/* Stars */}
            <div className="flex items-center gap-0.5" title={`Hodnocení: ${hike.rating}/5`}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= hike.rating
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-stone-700'
                  }`}
                />
              ))}
            </div>
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
              <span className="text-stone-500 text-[10px] uppercase tracking-wider">Čas</span>
              <span className="font-bold text-stone-200 font-mono mt-0.5">
                {hike.duration}
              </span>
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

          {/* Admin only action buttons */}
          {isAdmin && (
            <div className="flex items-center gap-1">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
