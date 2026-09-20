import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Mountain,
  Plus,
  Footprints,
  TrendingUp,
  Award,
  Compass,
} from 'lucide-react';
import { MountainHike, UserRole, HikeDifficulty } from '../types';
import { HikeCard } from './HikeCard';

interface HikeListProps {
  hikes: MountainHike[];
  currentRole: UserRole;
  onSelectHike: (hike: MountainHike) => void;
  onEditHike: (hike: MountainHike) => void;
  onDeleteHike: (hikeId: string) => void;
  onRequestDelete?: (hike: MountainHike) => void;
  onAddNewHike: () => void;
}

export const HikeList: React.FC<HikeListProps> = ({
  hikes,
  currentRole,
  onSelectHike,
  onEditHike,
  onDeleteHike,
  onRequestDelete,
  onAddNewHike,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRange, setSelectedRange] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'dist-desc' | 'ele-desc' | 'rating-desc'>('date-desc');

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

  // Unique mountain ranges
  const mountainRanges = useMemo(() => {
    return ['all', ...Array.from(new Set(hikes.map((h) => h.mountainRange)))];
  }, [hikes]);

  // Filter & Sort
  const filteredAndSortedHikes = useMemo(() => {
    let result = [...hikes];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          h.mountainRange.toLowerCase().includes(q) ||
          h.description.toLowerCase().includes(q)
      );
    }

    // Mountain Range
    if (selectedRange !== 'all') {
      result = result.filter((h) => h.mountainRange === selectedRange);
    }

    // Difficulty
    if (selectedDifficulty !== 'all') {
      result = result.filter((h) => h.difficulty === selectedDifficulty);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'dist-desc':
          return b.distanceKm - a.distanceKm;
        case 'ele-desc':
          return b.elevationGainM - a.elevationGainM;
        case 'rating-desc':
          return b.rating - a.rating;
        default:
          return 0;
      }
    });

    return result;
  }, [hikes, searchQuery, selectedRange, selectedDifficulty, sortBy]);

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

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-stone-900/80 border border-stone-800 p-3 sm:p-4 rounded-2xl backdrop-blur-sm">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hledat podle názvu, pohoří či zážitků..."
            className="w-full pl-10 pr-4 py-2 bg-stone-950/80 border border-stone-800 rounded-xl text-xs sm:text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Difficulty filter */}
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Všechny obtížnosti</option>
            <option value="easy">Pouze lehké</option>
            <option value="moderate">Pouze střední</option>
            <option value="hard">Pouze těžké</option>
            <option value="ferrata">🧗 Pouze ferraty</option>
          </select>

          {/* Sort dropdown */}
          <div className="flex items-center gap-1 bg-stone-950 border border-stone-800 rounded-xl px-2 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent text-xs text-stone-300 focus:outline-none cursor-pointer py-1 pr-1"
            >
              <option value="date-desc">Nejnovější</option>
              <option value="date-asc">Nejstarší</option>
              <option value="dist-desc">Nejdelší trasa</option>
              <option value="ele-desc">Nejvyšší převýšení</option>
              <option value="rating-desc">Nejlépe hodnocené</option>
            </select>
          </div>

          {/* Admin Add Hike button */}
          {isAdmin && (
            <button
              type="button"
              onClick={onAddNewHike}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Přidat túru</span>
            </button>
          )}
        </div>
      </div>

      {/* Mountain Range Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <div className="flex items-center gap-1 text-stone-400 font-medium mr-1 shrink-0">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>Pohoří:</span>
        </div>
        {mountainRanges.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => setSelectedRange(range)}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors whitespace-nowrap cursor-pointer ${
              selectedRange === range
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-stone-900 text-stone-400 hover:text-stone-200 hover:bg-stone-800 border border-stone-800'
            }`}
          >
            {range === 'all' ? 'Všechna pohoří' : range}
          </button>
        ))}
      </div>

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
