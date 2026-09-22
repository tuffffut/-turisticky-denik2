import React, { useState, useMemo } from 'react';
import {
  X,
  Compass,
  RotateCcw,
  Sparkles,
  Check,
  AlertTriangle,
  Search,
  ArrowRight,
  Filter,
  CheckCircle2,
  RefreshCw,
  Layers,
  MapPin,
} from 'lucide-react';
import { MountainHike, UserRole } from '../types';
import { POPULAR_MOUNTAIN_RANGES, detectMountainRangeFromCoords, isSuspectMountainRange } from '../utils/mountainRanges';
import { saveHikeToFirestore } from '../utils/firebase';

interface MountainRangeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  hikes: MountainHike[];
  currentRole: UserRole;
  onSaveHike: (hike: MountainHike) => Promise<void>;
  onRefreshHikes?: () => void;
}

export const MountainRangeManagerModal: React.FC<MountainRangeManagerModalProps> = ({
  isOpen,
  onClose,
  hikes,
  currentRole,
  onSaveHike,
  onRefreshHikes,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRangeFilter, setSelectedRangeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Bulk rename state
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Calculate statistics of mountain ranges
  const rangeStats = useMemo(() => {
    const map = new Map<string, number>();
    hikes.forEach((h) => {
      const r = h.mountainRange?.trim() || 'Aktivita v terénu';
      map.set(r, (map.get(r) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => b.count - a.count);
  }, [hikes]);

  // Find suspect hikes (e.g. marked as Polsko or coords mismatch)
  const suspectHikes = useMemo(() => {
    return hikes.filter((h) => {
      const lat = h.peakCoords?.lat || (h.trackPoints?.[0]?.lat);
      const lng = h.peakCoords?.lng || (h.trackPoints?.[0]?.lng);
      return isSuspectMountainRange(h.mountainRange, lat, lng);
    });
  }, [hikes]);

  // Filtered hikes for quick edit table
  const displayedHikes = useMemo(() => {
    return hikes.filter((h) => {
      if (selectedRangeFilter === 'suspect') {
        const lat = h.peakCoords?.lat || (h.trackPoints?.[0]?.lat);
        const lng = h.peakCoords?.lng || (h.trackPoints?.[0]?.lng);
        if (!isSuspectMountainRange(h.mountainRange, lat, lng)) return false;
      } else if (selectedRangeFilter !== 'all') {
        if ((h.mountainRange || 'Aktivita v terénu') !== selectedRangeFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = h.title.toLowerCase().includes(q);
        const matchesRange = (h.mountainRange || '').toLowerCase().includes(q);
        return matchesTitle || matchesRange;
      }
      return true;
    });
  }, [hikes, selectedRangeFilter, searchQuery]);

  if (!isOpen) return null;

  const isAdmin = currentRole === 'admin';

  // Run automated GPS reassignment via server endpoint
  const handleAutoReassign = async (forceAll: boolean = false) => {
    if (!isAdmin) return;
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const resp = await fetch('/api/routes/reassign-ranges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceAll, fixSuspectOnly: !forceAll }),
      });

      if (!resp.ok) {
        throw new Error(`Server vrátil chybu HTTP ${resp.status}`);
      }

      const result = await resp.json();
      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: `Úspěšně opraveno ${result.updatedCount} aktivit podle GPS souřadnic.`,
        });
        if (onRefreshHikes) onRefreshHikes();
      } else {
        throw new Error(result.error || 'Neznámá chyba');
      }
    } catch (err: any) {
      console.error('Chyba při přehodnocení pohoří:', err);
      setStatusMessage({
        type: 'error',
        text: `Chyba při přehodnocení: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Run bulk rename of a category
  const handleBulkRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!renameFrom.trim() || !renameTo.trim()) {
      setStatusMessage({ type: 'error', text: 'Zvolte původní a zadejte nový název pohoří.' });
      return;
    }

    setIsRenaming(true);
    setStatusMessage(null);

    try {
      const resp = await fetch('/api/routes/batch-rename-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRange: renameFrom.trim(),
          toRange: renameTo.trim(),
        }),
      });

      if (!resp.ok) {
        throw new Error(`Server vrátil chybu HTTP ${resp.status}`);
      }

      const result = await resp.json();
      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: `Přejmenováno ${result.updatedCount} aktivit z „${renameFrom}“ na „${renameTo}“.`,
        });
        setRenameFrom('');
        setRenameTo('');
        if (onRefreshHikes) onRefreshHikes();
      } else {
        throw new Error(result.error || 'Neznámá chyba');
      }
    } catch (err: any) {
      console.error('Chyba při hromadném přejmenování:', err);
      setStatusMessage({
        type: 'error',
        text: `Chyba při přejmenování: ${err.message}`,
      });
    } finally {
      setIsRenaming(false);
    }
  };

  // Quick edit single hike range
  const handleQuickChangeRange = async (hike: MountainHike, newRange: string) => {
    if (!isAdmin) return;
    const cleanRange = newRange.trim();
    if (cleanRange === hike.mountainRange) return;

    const updated: MountainHike = {
      ...hike,
      mountainRange: cleanRange,
    };

    try {
      await onSaveHike(updated);
      await saveHikeToFirestore(updated);
    } catch (err) {
      console.warn('Chyba při ukládání změny pohoří:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-6 text-stone-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-stone-900/95 border-b border-stone-800 px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-100 flex items-center gap-2">
                <span>Správce pohoří a lokalit</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  {rangeStats.length} kategorií
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Přehled a pořádek v pohořích a regionech u všech {hikes.length} uložených aktivit.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-950/60 border-rose-800 text-rose-200'
                  : 'bg-stone-800/80 border-stone-700 text-stone-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                <span>{statusMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-stone-400 hover:text-stone-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Suspect Alert Banner if any */}
          {suspectHikes.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-300">
                    Nalezeno {suspectHikes.length} aktivit s podezřelým zařazením
                  </h4>
                  <p className="text-[11px] text-amber-300/80">
                    Některé aktivity mohou mít nesprávně přiřazené pohoří (např. Polsko u tras v Brně a ČR).
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isLoading || !isAdmin}
                onClick={() => handleAutoReassign(false)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Opravit podezřelé ({suspectHikes.length})</span>
              </button>
            </div>
          )}

          {/* Automated GPS Reassignment Card */}
          <div className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Automatické přehodnocení podle GPS</span>
              </h3>
              <p className="text-[11px] text-stone-400 mt-0.5 max-w-xl">
                Zanalyzuje GPS souřadnice každé trasy a automaticky určí správné pohoří či region (např. Brno a okolí, Moravský kras, Vysočina, Pálava, Tatry, Alpy).
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                disabled={isLoading || !isAdmin}
                onClick={() => handleAutoReassign(false)}
                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Přepočítá pouze podezřelé a nezařazené trasy"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Zkontrolovat a opravit</span>
              </button>
              <button
                type="button"
                disabled={isLoading || !isAdmin}
                onClick={() => handleAutoReassign(true)}
                className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                title="Vynutí přepočet u úplně všech tras podle jejich GPS"
              >
                Přepočítat vše
              </button>
            </div>
          </div>

          {/* Categories Grid / Chips */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Přehled pohoří v deníku ({rangeStats.length})</span>
              </span>
              {selectedRangeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedRangeFilter('all')}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  Zobrazit vše
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedRangeFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedRangeFilter === 'all'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-stone-950 border border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <span>Vše ({hikes.length})</span>
              </button>

              {suspectHikes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedRangeFilter('suspect')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedRangeFilter === 'suspect'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-amber-950/40 border border-amber-800 text-amber-300 hover:bg-amber-900/60'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Podezřelé ({suspectHikes.length})</span>
                </button>
              )}

              {rangeStats.map(({ range, count }) => {
                const isSelected = selectedRangeFilter === range;
                const isSuspectRange = range.toLowerCase() === 'polsko';
                return (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setSelectedRangeFilter(range)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold'
                        : isSuspectRange
                        ? 'bg-rose-950/40 border border-rose-800 text-rose-300 hover:bg-rose-900/60'
                        : 'bg-stone-950 border border-stone-800 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    <span>{range}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected
                          ? 'bg-emerald-800 text-emerald-100'
                          : 'bg-stone-800 text-stone-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk Rename Tool (Admin only) */}
          {isAdmin && (
            <div className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800">
              <h3 className="text-xs font-bold text-stone-200 mb-2 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hromadné přejmenování pohoří</span>
              </h3>
              <form onSubmit={handleBulkRename} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                <div>
                  <label className="block text-[11px] font-medium text-stone-400 mb-1">
                    Původní název pohoří:
                  </label>
                  <select
                    value={renameFrom}
                    onChange={(e) => setRenameFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">-- Vyberte pohoří --</option>
                    {rangeStats.map(({ range, count }) => (
                      <option key={range} value={range}>
                        {range} ({count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-400 mb-1">
                    Nový název pohoří:
                  </label>
                  <input
                    type="text"
                    list="popular-ranges-list"
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    placeholder="např. Brno a okolí"
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
                  />
                  <datalist id="popular-ranges-list">
                    {POPULAR_MOUNTAIN_RANGES.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isRenaming || !renameFrom || !renameTo}
                    className="w-full py-2 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Přejmenovat všechny</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick Edit Activity Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <span className="text-xs font-bold text-stone-200">
                Seznam aktivit ({displayedHikes.length})
              </span>
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hledat podle názvu..."
                  className="w-full pl-8 pr-7 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="border border-stone-800 rounded-2xl overflow-hidden bg-stone-950/60 divide-y divide-stone-800/80 max-h-96 overflow-y-auto">
              {displayedHikes.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500">
                  Nenalezeny žádné aktivity odpovídající výběru.
                </div>
              ) : (
                displayedHikes.map((hike) => {
                  const lat = hike.peakCoords?.lat || hike.trackPoints?.[0]?.lat;
                  const lng = hike.peakCoords?.lng || hike.trackPoints?.[0]?.lng;
                  const suggested = lat && lng ? detectMountainRangeFromCoords(lat, lng) : null;
                  const isSuspect = isSuspectMountainRange(hike.mountainRange, lat, lng);

                  return (
                    <div
                      key={hike.id}
                      className="p-3 sm:px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 hover:bg-stone-900/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-stone-200 truncate">
                            {hike.title}
                          </span>
                          {isSuspect && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800 shrink-0 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Podezřelé
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                          <span>{hike.date || 'Bez data'}</span>
                          <span>•</span>
                          <span>{hike.distanceKm} km</span>
                          {lat && lng && (
                            <>
                              <span>•</span>
                              <span className="text-stone-500 flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" />
                                {lat.toFixed(2)}°, {lng.toFixed(2)}°
                              </span>
                            </>
                          )}
                          {suggested && suggested !== hike.mountainRange && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400">
                                Dle GPS: {suggested}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Dropdown / Quick Switch */}
                      <div className="w-full sm:w-auto flex items-center gap-2 shrink-0">
                        {suggested && suggested !== hike.mountainRange && isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleQuickChangeRange(hike, suggested)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-[11px] font-medium text-emerald-300 transition-colors shrink-0"
                            title={`Použít navržené pohoří: ${suggested}`}
                          >
                            Použít {suggested}
                          </button>
                        )}

                        <select
                          disabled={!isAdmin}
                          value={hike.mountainRange || ''}
                          onChange={(e) => handleQuickChangeRange(hike, e.target.value)}
                          className="px-2.5 py-1 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-60 max-w-[200px] truncate"
                        >
                          <option value={hike.mountainRange || ''}>{hike.mountainRange || 'Bez pohoří'}</option>
                          {POPULAR_MOUNTAIN_RANGES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-stone-900/95 border-t border-stone-800 px-5 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <span className="text-xs text-stone-500">
            Změny se okamžitě synchronizují s databází Firestore.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Hotovo / Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
