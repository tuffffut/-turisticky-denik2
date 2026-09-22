import React, { useState, useMemo } from 'react';
import {
  Mountain,
  Plus,
  Footprints,
  TrendingUp,
  Award,
  Sparkles,
} from 'lucide-react';
import { MountainHike, UserRole, HikeFilterState } from '../types';
import { HikeCard } from './HikeCard';
import { HikeFilterBar } from './HikeFilterBar';
import { DEFAULT_FILTER_STATE, filterAndSortHikes, getAvailableFilterOptions } from '../utils/filterUtils';

interface HikeListProps {
  hikes: MountainHike[];
  currentRole: UserRole;
  onSelectHike: (hike: MountainHike) => void;
  onEditHike: (hike: MountainHike) => void;
  onDeleteHike: (hikeId: string) => void;
  onRequestDelete?: (hike: MountainHike) => void;
  onAddNewHike: () => void;
  onOpenRangeManager?: () => void;
}

export const HikeList: React.FC<HikeListProps> = ({
  hikes,
  currentRole,
  onSelectHike,
  onEditHike,
  onDeleteHike,
  onRequestDelete,
  onAddNewHike,
  onOpenRangeManager,
}) => {
  const [filters, setFilters] = useState<HikeFilterState>(DEFAULT_FILTER_STATE);

  const isAdmin = currentRole === 'admin';

  // Overall statistics
  const stats = useMemo(() => {
    let totalDist = 0;
    let totalEle = 0;
    let highest = 0;

    hikes.forEach((h) => {
      totalDist += h.distanceKm;
      totalEle += h.elevationGainM;
      if (h.highestPointM && h.highestPointM > highest) {
        highest = h.highestPointM;
      }
    });

    return {
      totalDist: Math.round(totalDist * 10) / 10,
      totalEle,
      count: hikes.length,
      highestPeak: highest,
    };
  }, [hikes]);

  // Available filter options (years, months, ranges, activities) with counts
  const filterOptions = useMemo(() => {
    return getAvailableFilterOptions(hikes, filters);
  }, [hikes, filters]);

  // Filter & Sort
  const filteredAndSortedHikes = useMemo(() => {
    return filterAndSortHikes(hikes, filters);
  }, [hikes, filters]);

  return (
    <div className="space-y-6">
      {/* Overall Stats Summary Hero Card */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 border border-stone-800 p-5 sm:p-6 shadow-xl">
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-950/80 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <Footprints className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400">Nachozeno</div>
              <div className="text-xl sm:text-2xl font-extrabold text-stone-100 font-mono">
                {stats.totalDist} <span className="text-xs font-normal text-stone-400">km</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-950/80 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400">Nastoupáno</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono">
                +{stats.totalEle.toLocaleString('cs-CZ')} <span className="text-xs font-normal text-stone-400">m</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-950/80 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <Mountain className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400">Nejvyšší vrchol</div>
              <div className="text-xl sm:text-2xl font-extrabold text-stone-100 font-mono">
                {stats.highestPeak ? `${stats.highestPeak} m` : '—'}
              </div>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-cyan-950/80 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400">Počet výprav</div>
              <div className="text-xl sm:text-2xl font-extrabold text-stone-100 font-mono">
                {stats.count}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Compact Filter Bar (Search, Years, Months, Activities, Mountain Ranges, Difficulty) */}
      <HikeFilterBar
        filters={filters}
        onChange={setFilters}
        totalHikesCount={hikes.length}
        filteredHikesCount={filteredAndSortedHikes.length}
        filterOptions={filterOptions}
        onOpenRangeManager={onOpenRangeManager}
        renderExtraActions={
          isAdmin ? (
            <button
              type="button"
              onClick={onAddNewHike}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Přidat túru</span>
            </button>
          ) : undefined
        }
      />

      {/* Grid of Hikes */}
      {filteredAndSortedHikes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAndSortedHikes.map((hike) => (
            <HikeCard
              key={hike.id}
              hike={hike}
              currentRole={currentRole}
              onSelect={onSelectHike}
              onEdit={onEditHike}
              onDelete={onDeleteHike}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-stone-900/60 rounded-3xl border border-dashed border-stone-800">
          <div className="w-14 h-14 rounded-2xl bg-stone-800 text-stone-400 flex items-center justify-center mb-3">
            <Mountain className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-stone-200">Žádné túry nenalezeny</h3>
          <p className="text-stone-400 text-xs mt-1 max-w-sm">
            Pro zadané filtry nebyly nalezeny žádné horské výpravy. Zkuste vymazat hledaný text nebo zvolit jiné pohoří.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={onAddNewHike}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Zaznamenat novou túru</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
