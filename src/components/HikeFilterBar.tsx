import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  Compass,
  Calendar,
  Layers,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { HikeFilterState } from '../types';
import { countActiveFilters, DEFAULT_FILTER_STATE } from '../utils/filterUtils';

interface FilterOptions {
  years: { year: string; count: number }[];
  months: { month: number; name: string; short: string; count: number }[];
  mountainRanges: { range: string; count: number }[];
  activities: { type: string; label: string; count: number }[];
}

interface HikeFilterBarProps {
  filters: HikeFilterState;
  onChange: (newFilters: HikeFilterState) => void;
  totalHikesCount: number;
  filteredHikesCount: number;
  filterOptions: FilterOptions;
  isFloatingOnMap?: boolean;
  onCloseMapOverlay?: () => void;
  renderExtraActions?: React.ReactNode;
  onOpenRangeManager?: () => void;
}

export const HikeFilterBar: React.FC<HikeFilterBarProps> = ({
  filters,
  onChange,
  totalHikesCount,
  filteredHikesCount,
  filterOptions,
  isFloatingOnMap = false,
  onCloseMapOverlay,
  renderExtraActions,
  onOpenRangeManager,
}) => {
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const activeCount = countActiveFilters(filters);

  const handleReset = () => {
    onChange({
      ...DEFAULT_FILTER_STATE,
      sortBy: filters.sortBy, // keep sort preference
    });
  };

  const updateFilter = (key: keyof HikeFilterState, value: any) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isFloatingOnMap
          ? 'bg-stone-900/95 backdrop-blur-md border-stone-800 shadow-2xl p-3 sm:p-4 text-xs'
          : 'bg-stone-900/80 backdrop-blur-sm border-stone-800 p-3.5 sm:p-4 shadow-lg'
      }`}
    >
      {/* Primary Row: Search, Quick Year Selector & Toggle */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => updateFilter('searchQuery', e.target.value)}
            placeholder="Hledat výpravu, pohoří, zážitky..."
            className="w-full pl-9 pr-8 py-2 bg-stone-950/80 border border-stone-800 rounded-xl text-xs text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => updateFilter('searchQuery', '')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-stone-500 hover:text-stone-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Year selector chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none shrink-0">
          <button
            type="button"
            onClick={() => updateFilter('year', 'all')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filters.year === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-stone-950/80 text-stone-400 hover:text-stone-200 hover:bg-stone-800 border border-stone-800'
            }`}
          >
            Všechny roky ({totalHikesCount})
          </button>
          {filterOptions.years.map(({ year, count }) => (
            <button
              key={year}
              type="button"
              onClick={() => updateFilter('year', filters.year === year ? 'all' : year)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                filters.year === year
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-stone-950/80 text-stone-400 hover:text-stone-200 hover:bg-stone-800 border border-stone-800'
              }`}
            >
              {year} <span className="text-[10px] opacity-75 font-normal">({count})</span>
            </button>
          ))}
        </div>

        {/* Filter Toggle & Reset Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              activeCount > 0 || isAdvancedExpanded
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                : 'bg-stone-950/80 border-stone-800 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Filtry</span>
            {activeCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-stone-950 font-bold text-[10px] flex items-center justify-center">
                {activeCount}
              </span>
            )}
            {isAdvancedExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5 text-stone-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5 text-stone-400" />
            )}
          </button>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={handleReset}
              title="Resetovat filtry"
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium bg-stone-950 border border-stone-800 text-stone-400 hover:text-rose-400 hover:border-rose-900/50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {renderExtraActions}

          {isFloatingOnMap && onCloseMapOverlay && (
            <button
              type="button"
              onClick={onCloseMapOverlay}
              className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer ml-auto"
              title="Zavřít panel filtrů"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Filter Controls Ribbon */}
      {isAdvancedExpanded && (
        <div className="mt-3 pt-3 border-t border-stone-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* 1. Mountain Range Selector */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
                <Compass className="w-3 h-3 text-emerald-400" />
                <span>Pohoří:</span>
              </label>
              {onOpenRangeManager && (
                <button
                  type="button"
                  onClick={onOpenRangeManager}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium hover:underline cursor-pointer"
                  title="Otevřít správce pohoří a lokalit"
                >
                  Správa pohoří
                </button>
              )}
            </div>
            <select
              value={filters.mountainRange}
              onChange={(e) => updateFilter('mountainRange', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">⛰️ Všechna pohoří ({totalHikesCount})</option>
              {filterOptions.mountainRanges.map(({ range, count }) => (
                <option key={range} value={range}>
                  {range} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Month Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-amber-400" />
              <span>Měsíc v roce:</span>
            </label>
            <select
              value={filters.month}
              onChange={(e) => updateFilter('month', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Celý rok (všechny měsíce)</option>
              {filterOptions.months.map(({ month, name, count }) => (
                <option key={month} value={String(month)}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Activity Type Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>Druh aktivity:</span>
            </label>
            <select
              value={filters.activityType}
              onChange={(e) => updateFilter('activityType', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Všechny aktivity</option>
              {filterOptions.activities.map(({ type, label, count }) => (
                <option key={type} value={type}>
                  {label} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Difficulty Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Obtížnost:</span>
            </label>
            <select
              value={filters.difficulty}
              onChange={(e) => updateFilter('difficulty', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Všechny obtížnosti</option>
              <option value="easy">🟢 Pouze lehké</option>
              <option value="moderate">🟡 Pouze střední</option>
              <option value="hard">🔴 Pouze těžké / náročné</option>
              <option value="ferrata">🧗 Pouze ferraty</option>
              <option value="climbing">🧗 Pouze lezení</option>
              <option value="unspecified">Bez určené obtížnosti</option>
            </select>
          </div>

          {/* 5. Sort By */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-stone-400" />
              <span>Řazení:</span>
            </label>
            <select
              value={filters.sortBy}
              onChange={(e: any) => updateFilter('sortBy', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="date-desc">Nejnovější první</option>
              <option value="date-asc">Nejstarší první</option>
              <option value="dist-desc">Nejdelší trasa (km)</option>
              <option value="ele-desc">Nejvyšší převýšení (+m)</option>
              <option value="rating-desc">Nejlépe hodnocené ⭐</option>
            </select>
          </div>
        </div>
      )}

      {/* Active Filter Chips & Result Counter */}
      {activeCount > 0 && (
        <div className="mt-2.5 pt-2 border-t border-stone-800/60 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-stone-400 font-medium mr-1">
            Zobrazeno {filteredHikesCount} z {totalHikesCount} výprav:
          </span>

          {filters.year !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-medium">
              Rok: {filters.year}
              <button
                type="button"
                onClick={() => updateFilter('year', 'all')}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.month !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 font-medium">
              Měsíc:{' '}
              {filterOptions.months.find((m) => String(m.month) === filters.month)?.name ||
                filters.month}
              <button
                type="button"
                onClick={() => updateFilter('month', 'all')}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.mountainRange !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-medium">
              Pohoří: {filters.mountainRange}
              <button
                type="button"
                onClick={() => updateFilter('mountainRange', 'all')}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.activityType !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-950/80 border border-purple-800 text-purple-300 font-medium">
              Aktivita:{' '}
              {filterOptions.activities.find((a) => a.type === filters.activityType)?.label ||
                filters.activityType}
              <button
                type="button"
                onClick={() => updateFilter('activityType', 'all')}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.difficulty !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 font-medium">
              Obtížnost: {filters.difficulty}
              <button
                type="button"
                onClick={() => updateFilter('difficulty', 'all')}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.searchQuery && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 font-medium">
              Hledat: &quot;{filters.searchQuery}&quot;
              <button
                type="button"
                onClick={() => updateFilter('searchQuery', '')}
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="text-stone-400 hover:text-rose-400 underline ml-auto text-[11px] cursor-pointer"
          >
            Zrušit všechny filtry
          </button>
        </div>
      )}
    </div>
  );
};
