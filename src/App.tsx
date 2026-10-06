import React, { useState, useEffect, useMemo } from 'react';
import {
  Mountain,
  Compass,
  Footprints,
  Calendar,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Search,
  Filter,
  Plus,
  Lock,
  Unlock,
  Layers,
  MapPin,
  Camera,
  ExternalLink,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Award,
} from 'lucide-react';
import { HikeRoute, HikeStats, ActivityType } from './types';
import { POPULAR_MOUNTAIN_RANGES } from './utils/mountainRanges';
import { HikeMap } from './components/HikeMap';
import { HikeModal } from './components/HikeModal';
import { PinModal } from './components/PinModal';

export const App: React.FC = () => {
  const [routes, setRoutes] = useState<HikeRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRange, setSelectedRange] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'distance' | 'elevation'>('date');
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'list'>('split');

  // Modals & Selection
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [modalRoute, setModalRoute] = useState<HikeRoute | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewHikeModal, setIsNewHikeModal] = useState(false);

  // Security & PIN
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [storedPin, setStoredPin] = useState<string>(() => {
    return localStorage.getItem('horsky_denik_pin') || '1234';
  });

  // Fetch routes from server/Firestore
  const fetchRoutes = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/routes?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const loadedRoutes = (data.routes || []).map((r: any) => ({
          ...r,
          id: r.id || r.title || 'route_' + Math.random(),
          photos: Array.isArray(r.photos) ? r.photos : [],
        }));
        setRoutes(loadedRoutes);
      }
    } catch (err) {
      console.error('Chyba při načítání tras:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes(false);

    // Live multi-device sync: auto-refresh when tab gains focus or screen turns on
    const handleFocus = () => {
      fetchRoutes(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRoutes(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic live sync every 15 seconds when active
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRoutes(true);
      }
    }, 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(pollInterval);
    };
  }, []);

  const handleUpdatePin = (newPin: string) => {
    setStoredPin(newPin);
    localStorage.setItem('horsky_denik_pin', newPin);
  };

  // Stats calculation
  const stats: HikeStats = useMemo(() => {
    const totalHikes = routes.length;
    const totalDistanceKm = Math.round(
      routes.reduce((acc, r) => acc + (r.distanceKm || 0), 0) * 10
    ) / 10;
    const totalElevationM = routes.reduce((acc, r) => acc + (r.elevationGainM || 0), 0);
    const highestElevationM = routes.reduce(
      (max, r) => Math.max(max, r.highestPointM || 0),
      0
    );
    const rangesSet = new Set(routes.map((r) => r.mountainRange).filter(Boolean));
    return {
      totalHikes,
      totalDistanceKm,
      totalElevationM,
      highestElevationM,
      mountainRangesCount: rangesSet.size,
    };
  }, [routes]);

  // Filtered & sorted routes
  const filteredRoutes = useMemo(() => {
    return routes
      .filter((route) => {
        const matchesSearch =
          route.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          route.mountainRange?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          route.description?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesRange =
          selectedRange === 'all' || route.mountainRange === selectedRange;

        const matchesActivity =
          selectedActivity === 'all' || route.activityType === selectedActivity;

        return matchesSearch && matchesRange && matchesActivity;
      })
      .sort((a, b) => {
        if (sortBy === 'distance') return (b.distanceKm || 0) - (a.distanceKm || 0);
        if (sortBy === 'elevation') return (b.elevationGainM || 0) - (a.elevationGainM || 0);
        return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      });
  }, [routes, searchQuery, selectedRange, selectedActivity, sortBy]);

  // Save or update route
  const handleSaveRoute = async (updatedRoute: Partial<HikeRoute>) => {
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRoute),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Uložení selhalo');
      }

      await fetchRoutes();
      if (modalRoute && modalRoute.id === updatedRoute.id) {
        setModalRoute((prev) => (prev ? { ...prev, ...updatedRoute } as HikeRoute : null));
      }
    } catch (err: any) {
      console.error('Chyba při ukládání trasy:', err);
      alert('Chyba při ukládání do databáze: ' + err.message);
      throw err;
    }
  };

  // Delete route
  const handleDeleteRoute = async (routeId: string) => {
    try {
      const res = await fetch(`/api/routes/${encodeURIComponent(routeId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Smazání selhalo');
      }
      setRoutes((prev) => prev.filter((r) => r.id !== routeId));
      if (selectedRouteId === routeId) setSelectedRouteId(null);
      if (modalRoute?.id === routeId) setIsModalOpen(false);
    } catch (err: any) {
      alert('Chyba při mazání: ' + err.message);
    }
  };

  const handleOpenDetail = (route: HikeRoute) => {
    setModalRoute(route);
    setSelectedRouteId(route.id);
    setIsNewHikeModal(false);
    setIsModalOpen(true);
  };

  const handleAddNewHike = () => {
    if (!isUnlocked) {
      setIsPinModalOpen(true);
      return;
    }
    setModalRoute({
      id: 'route_' + Date.now(),
      title: '',
      mountainRange: 'Krkonoše',
      date: new Date().toISOString().split('T')[0],
      activityType: 'hiking',
      distanceKm: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      highestPointM: 0,
      photos: [],
    });
    setIsNewHikeModal(true);
    setIsModalOpen(true);
  };

  const activeMountainRanges = useMemo(() => {
    const list = Array.from(new Set(routes.map((r) => r.mountainRange).filter(Boolean)));
    return list.sort();
  }, [routes]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-stone-800/80 bg-stone-900/70 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-950 text-white flex items-center justify-center">
              <Mountain className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
                  Horský Deník
                </h1>
                <span className="text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Cloud Storage
                </span>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block">
                Evidence výprav, GPX tras a Full HD fotografií
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* View Mode toggles */}
            <div className="hidden md:flex bg-stone-950 border border-stone-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  viewMode === 'split' ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                Rozděleno
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  viewMode === 'map' ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                Mapa
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  viewMode === 'list' ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                Seznam
              </button>
            </div>

            {/* PIN Lock toggle */}
            <button
              onClick={() => {
                if (isUnlocked) {
                  setIsUnlocked(false);
                } else {
                  setIsPinModalOpen(true);
                }
              }}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                isUnlocked
                  ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400'
                  : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
              }`}
              title={isUnlocked ? 'Režim úprav odemčen (kliknutím zamknete)' : 'Odemknout režim úprav (PIN)'}
            >
              {isUnlocked ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4" />}
              <span className="hidden sm:inline">
                {isUnlocked ? 'Úpravy odemčeny' : 'Zamčeno (PIN)'}
              </span>
            </button>

            {/* Add Hike button */}
            <button
              onClick={handleAddNewHike}
              className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-lg shadow-emerald-950 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Přidat výpravu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Stats Summary Banner */}
      <section className="bg-stone-900/40 border-b border-stone-800/60 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-stone-950/60 border border-stone-800/80 p-3 rounded-2xl">
              <span className="text-[11px] font-medium text-stone-400 block mb-0.5">
                Výprav v deníku
              </span>
              <span className="text-xl font-black text-white">{stats.totalHikes}</span>
            </div>

            <div className="bg-stone-950/60 border border-stone-800/80 p-3 rounded-2xl">
              <span className="text-[11px] font-medium text-stone-400 block mb-0.5">
                Celkem nachozeno
              </span>
              <span className="text-xl font-black text-emerald-400">
                {stats.totalDistanceKm} km
              </span>
            </div>

            <div className="bg-stone-950/60 border border-stone-800/80 p-3 rounded-2xl">
              <span className="text-[11px] font-medium text-stone-400 block mb-0.5">
                Celkem nastoupáno
              </span>
              <span className="text-xl font-black text-emerald-400 flex items-center gap-0.5">
                <ArrowUpRight className="w-4 h-4" />
                +{stats.totalElevationM.toLocaleString('cs-CZ')} m
              </span>
            </div>

            <div className="bg-stone-950/60 border border-stone-800/80 p-3 rounded-2xl">
              <span className="text-[11px] font-medium text-stone-400 block mb-0.5">
                Nejvyšší vrchol
              </span>
              <span className="text-xl font-black text-amber-400">
                {stats.highestElevationM} m n.m.
              </span>
            </div>

            <div className="bg-stone-950/60 border border-stone-800/80 p-3 rounded-2xl col-span-2 sm:col-span-1">
              <span className="text-[11px] font-medium text-stone-400 block mb-0.5">
                Prozkoumaných pohoří
              </span>
              <span className="text-xl font-black text-stone-300">
                {stats.mountainRangesCount} oblastí
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Search & Filter Ribbon */}
        <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat výpravu, pohoří, vrchol..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Range filter */}
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Všechna pohoří ({routes.length})</option>
              {activeMountainRanges.map((range) => (
                <option key={range} value={range}>
                  {range} ({routes.filter((r) => r.mountainRange === range).length})
                </option>
              ))}
            </select>

            {/* Activity filter */}
            <select
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Všechny aktivity</option>
              <option value="hiking">Pěší turistika</option>
              <option value="ferrata">Via Ferrata</option>
              <option value="trail_running">Horský běh</option>
              <option value="winter">Zimní / Skialpy</option>
              <option value="biking">Kolo / Gravel</option>
            </select>

            {/* Sort filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="date">Řadit: Nejnovější</option>
              <option value="distance">Řadit: Nejdelší (km)</option>
              <option value="elevation">Řadit: Nejvyšší převýšení</option>
            </select>
          </div>
        </div>

        {/* Dynamic Views */}
        <div className="space-y-6">
          {/* Map Section */}
          {(viewMode === 'split' || viewMode === 'map') && (
            <div>
              <HikeMap
                routes={filteredRoutes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={(id) => {
                  setSelectedRouteId(id);
                  const found = routes.find((r) => r.id === id);
                  if (found) handleOpenDetail(found);
                }}
                className={viewMode === 'map' ? 'h-[75vh] w-full rounded-2xl' : 'h-96 w-full rounded-2xl'}
              />
            </div>
          )}

          {/* List / Cards Section */}
          {(viewMode === 'split' || viewMode === 'list') && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                  <span>Výpravy ({filteredRoutes.length})</span>
                </h3>
              </div>

              {loading ? (
                <div className="py-20 text-center">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <span className="text-stone-400 text-sm">Načítám výpravy z databáze...</span>
                </div>
              ) : filteredRoutes.length === 0 ? (
                <div className="py-16 text-center bg-stone-900/40 border border-dashed border-stone-800 rounded-2xl">
                  <Mountain className="w-10 h-10 text-stone-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-stone-300">
                    Nenalezena žádná výprava
                  </p>
                  <p className="text-xs text-stone-500 mt-1">
                    Zkuste upravit vyhledávací filtr nebo přidejte novou výpravu přes tlačítko v záhlaví.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredRoutes.map((route) => {
                    const isSelected = route.id === selectedRouteId;
                    const photoCount = Array.isArray(route.photos) ? route.photos.length : 0;
                    const firstPhoto = photoCount > 0 ? route.photos![0] : null;
                    const firstPhotoSrc =
                      typeof firstPhoto === 'string'
                        ? firstPhoto.startsWith('/api/photos/')
                          ? `${firstPhoto}?raw=1`
                          : firstPhoto
                        : firstPhoto?.dataUrl || firstPhoto?.rawUrl || firstPhoto?.url || '';

                    return (
                      <div
                        key={route.id}
                        onClick={() => handleOpenDetail(route)}
                        className={`group bg-stone-900/80 border rounded-2xl p-5 cursor-pointer transition flex flex-col justify-between hover:border-emerald-500/80 hover:shadow-xl hover:shadow-black/50 ${
                          isSelected
                            ? 'border-emerald-500 bg-stone-900 shadow-emerald-950/40 shadow-lg'
                            : 'border-stone-800'
                        }`}
                      >
                        <div>
                          {/* Card top badges */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/50 px-2.5 py-0.5 rounded-full truncate">
                              {route.mountainRange}
                            </span>
                            {route.date && (
                              <span className="text-xs text-stone-400 flex items-center gap-1 whitespace-nowrap">
                                <Calendar className="w-3 h-3 text-stone-500" />
                                {new Date(route.date).toLocaleDateString('cs-CZ')}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition line-clamp-2 mb-3">
                            {route.title}
                          </h4>

                          {/* Photo preview banner if exists */}
                          {firstPhotoSrc && (
                            <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-950 border border-stone-800 mb-3">
                              <img
                                src={firstPhotoSrc}
                                alt={route.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                loading="lazy"
                              />
                              <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur px-2 py-0.5 rounded-md text-[10px] font-semibold text-stone-300 flex items-center gap-1">
                                <Camera className="w-3 h-3 text-emerald-400" />
                                <span>{photoCount} fotek</span>
                              </div>
                            </div>
                          )}

                          {/* Metrics row */}
                          <div className="grid grid-cols-3 gap-2 bg-stone-950/60 border border-stone-800/70 p-2.5 rounded-xl text-center mb-3">
                            <div>
                              <span className="text-[10px] text-stone-500 block">Délka</span>
                              <span className="text-xs font-bold text-white">
                                {route.distanceKm} km
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-stone-500 block">Převýšení</span>
                              <span className="text-xs font-bold text-emerald-400">
                                +{route.elevationGainM} m
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-stone-500 block">Nejvyšší bod</span>
                              <span className="text-xs font-bold text-amber-400">
                                {route.highestPointM} m
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card footer */}
                        <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                          <span className="text-stone-400 flex items-center gap-1">
                            {photoCount > 0 ? (
                              <span className="text-emerald-400 font-medium">
                                {photoCount} ostrých fotek
                              </span>
                            ) : (
                              <span>Bez fotek</span>
                            )}
                          </span>
                          <span className="text-emerald-400 group-hover:translate-x-0.5 transition font-medium flex items-center gap-0.5">
                            Detail trasy <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800/80 py-6 text-center text-xs text-stone-500 bg-stone-950">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Horský Deník • Evidence horských výprav a GPX tras</span>
          <span className="text-stone-600">
            Zabezpečené cloudové úložiště Firebase (Full HD WebP optimalizace)
          </span>
        </div>
      </footer>

      {/* Hike View / Edit Modal */}
      <HikeModal
        route={modalRoute}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRoute}
        onDelete={handleDeleteRoute}
        canEdit={isUnlocked}
        onRequestUnlock={() => setIsPinModalOpen(true)}
        isNew={isNewHikeModal}
      />

      {/* PIN Security Modal */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          setIsUnlocked(true);
          setIsPinModalOpen(false);
        }}
        storedPin={storedPin}
        onUpdatePin={handleUpdatePin}
      />
    </div>
  );
};

export default App;
