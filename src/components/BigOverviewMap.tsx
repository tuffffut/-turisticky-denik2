import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  Mountain,
  Layers,
  Compass,
  Maximize2,
  Filter,
  X,
  List,
  MapPin,
  ChevronRight,
  Sparkles,
  Footprints,
  TrendingUp,
  Calendar,
  Plus,
  Minus,
} from 'lucide-react';
import { MountainHike, HikeFilterState } from '../types';
import {
  DEFAULT_FILTER_STATE,
  filterAndSortHikes,
  getAvailableFilterOptions,
  countActiveFilters,
} from '../utils/filterUtils';
import { HikeFilterBar } from './HikeFilterBar';
import { formatDateDisplay } from '../utils/dateUtils';

interface BigOverviewMapProps {
  hikes: MountainHike[];
  onSelectHike: (hike: MountainHike) => void;
  onOpenRangeManager?: () => void;
}

type RouteDisplayMode = 'selected-only' | 'all-routes' | 'hidden';

export const BigOverviewMap: React.FC<BigOverviewMapProps> = ({
  hikes,
  onSelectHike,
  onOpenRangeManager,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Filters state
  const [filters, setFilters] = useState<HikeFilterState>(DEFAULT_FILTER_STATE);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [routeMode, setRouteMode] = useState<RouteDisplayMode>('selected-only');
  const [activeHikeId, setActiveHikeId] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(7);
  const [selectedClusterHikes, setSelectedClusterHikes] = useState<{
    title: string;
    hikes: MountainHike[];
  } | null>(null);

  const routeLayersRef = useRef<Map<string, L.Polyline>>(new Map());
  const markersLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Filtered hikes
  const filteredHikes = useMemo(() => {
    return filterAndSortHikes(hikes, filters);
  }, [hikes, filters]);

  // Filter options for dropdowns
  const filterOptions = useMemo(() => {
    return getAvailableFilterOptions(hikes, filters);
  }, [hikes, filters]);

  const activeFiltersCount = countActiveFilters(filters);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
    }).setView([49.8, 15.5], 7);

    // Explicitly enable zoom interactions
    map.scrollWheelZoom.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Layers
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution:
        '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>, &copy; <a href="https://openstreetmap.org">OSM</a>',
    });

    const standardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    topoLayer.addTo(map);

    L.control
      .layers(
        {
          'Topografická mapa': topoLayer,
          'Standardní OSM': standardLayer,
        },
        {},
        { position: 'topright' }
      )
      .addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerGroupRef.current = markersGroup;

    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Draw Route Polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing polylines
    routeLayersRef.current.forEach((poly) => poly.remove());
    routeLayersRef.current.clear();

    if (routeMode === 'hidden') return;

    filteredHikes.forEach((hike) => {
      if (!hike.trackPoints || hike.trackPoints.length < 2) return;

      const isHighlighted = activeHikeId === hike.id;
      // In selected-only mode, only draw if this hike is selected
      if (routeMode === 'selected-only' && !isHighlighted) return;

      const latLngs: L.LatLngTuple[] = hike.trackPoints.map((p) => [p.lat, p.lng]);
      const color = isHighlighted ? '#10b981' : '#38bdf8';
      const weight = isHighlighted ? 5 : 2.5;
      const opacity = isHighlighted ? 0.95 : 0.45;

      const poly = L.polyline(latLngs, {
        color,
        weight,
        opacity,
      }).addTo(map);

      if (isHighlighted) {
        poly.bringToFront();
      }

      poly.bindTooltip(
        `<strong>${hike.title}</strong><br/>${hike.distanceKm} km | +${hike.elevationGainM} m`,
        { sticky: true }
      );

      poly.on('click', () => {
        setActiveHikeId(hike.id);
      });

      routeLayersRef.current.set(hike.id, poly);
    });
  }, [filteredHikes, routeMode, activeHikeId]);

  // 3. Smart Clustering & Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // Collect coordinates for each hike
    interface HikeWithPoint {
      hike: MountainHike;
      lat: number;
      lng: number;
    }

    const points: HikeWithPoint[] = [];
    filteredHikes.forEach((h) => {
      const lat =
        h.trackPoints && h.trackPoints.length > 0
          ? h.trackPoints[0].lat
          : h.peakCoords?.lat;
      const lng =
        h.trackPoints && h.trackPoints.length > 0
          ? h.trackPoints[0].lng
          : h.peakCoords?.lng;

      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        points.push({ hike: h, lat, lng });
      }
    });

    if (points.length === 0) return;

    // Dynamic cluster distance: decreases as user zooms in, so nearby peaks separate cleanly
    const currentZ = map.getZoom();
    const pixelDistance = currentZ >= 13 ? 20 : currentZ >= 10 ? 35 : 55;
    const clusters: { centerLat: number; centerLng: number; items: HikeWithPoint[] }[] = [];

    points.forEach((pt) => {
      const pPoint = map.latLngToLayerPoint([pt.lat, pt.lng]);
      let assigned = false;

      for (const cl of clusters) {
        const clPoint = map.latLngToLayerPoint([cl.centerLat, cl.centerLng]);
        const dist = Math.hypot(pPoint.x - clPoint.x, pPoint.y - clPoint.y);

        if (dist < pixelDistance) {
          cl.items.push(pt);
          // Recalculate center
          cl.centerLat = cl.items.reduce((s, i) => s + i.lat, 0) / cl.items.length;
          cl.centerLng = cl.items.reduce((s, i) => s + i.lng, 0) / cl.items.length;
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        clusters.push({
          centerLat: pt.lat,
          centerLng: pt.lng,
          items: [pt],
        });
      }
    });

    // Render Markers or Clusters
    clusters.forEach((cluster) => {
      if (cluster.items.length > 1) {
        // Multi-hike cluster badge
        const count = cluster.items.length;
        const isClusterActive = cluster.items.some((it) => it.hike.id === activeHikeId);

        const size = count >= 10 ? 44 : 38;
        const clusterIcon = L.divIcon({
          className: 'custom-cluster-icon',
          html: `
            <div class="flex items-center justify-center w-${size} h-${size} rounded-full font-bold text-white shadow-xl cursor-pointer transition-transform hover:scale-110 ${
              isClusterActive
                ? 'bg-gradient-to-tr from-amber-600 to-amber-400 ring-4 ring-amber-300/40'
                : 'bg-gradient-to-tr from-emerald-700 via-emerald-600 to-teal-500 ring-4 ring-emerald-500/30'
            }" style="width:${size}px; height:${size}px;">
              <div class="flex flex-col items-center justify-center leading-none">
                <span class="text-[10px] opacity-80">⛰️</span>
                <span class="text-xs font-black tracking-tight">${count}</span>
              </div>
            </div>
          `,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const clusterMarker = L.marker([cluster.centerLat, cluster.centerLng], {
          icon: clusterIcon,
        }).addTo(group);

        clusterMarker.bindTooltip(
          `<div class="font-sans text-xs">
            <strong>${count} výprav v této oblasti</strong><br/>
            <span class="text-stone-400">Kliknutím zobrazíte seznam výprav a přiblížíte mapu</span>
          </div>`,
          { sticky: true }
        );

        clusterMarker.on('click', () => {
          const clusterHikes = cluster.items.map((i) => i.hike);
          setSelectedClusterHikes({
            title: `${clusterHikes.length} výprav v této lokalitě`,
            hikes: clusterHikes,
          });

          const latLngs = cluster.items.map((i) => [i.lat, i.lng] as L.LatLngTuple);
          const bounds = L.latLngBounds(latLngs);
          const spanMeters = bounds.getNorthEast().distanceTo(bounds.getSouthWest());

          if (spanMeters > 50 && map.getZoom() < 14) {
            map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
          } else {
            map.flyTo([cluster.centerLat, cluster.centerLng], Math.min(map.getZoom() + 2, 16));
          }
        });
      } else {
        // Single individual hike pin
        const item = cluster.items[0];
        const hike = item.hike;
        const isSelected = activeHikeId === hike.id;
        const isClimb =
          hike.activityType === 'climbing' ||
          hike.activityType === 'mountaineering' ||
          hike.difficulty === 'climbing';

        const iconEmoji = isClimb ? '🧗' : '⛰️';
        const pinColorClass = isSelected
          ? 'bg-amber-500 text-stone-950 ring-4 ring-amber-300/50 scale-125 z-50'
          : isClimb
          ? 'bg-purple-600 text-white ring-2 ring-white/60 hover:scale-110'
          : 'bg-emerald-600 text-white ring-2 ring-white/60 hover:scale-110';

        const singlePinIcon = L.divIcon({
          className: 'custom-single-pin',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer transition-all transform -translate-x-1/2 -translate-y-1/2">
              <div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg text-xs font-bold ${pinColorClass}">
                <span>${iconEmoji}</span>
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([item.lat, item.lng], { icon: singlePinIcon }).addTo(group);

        // Rich popup
        const hasPhoto = Boolean(hike.photos?.[0]);
        const photoBlock = hasPhoto
          ? `
            <div class="w-full h-24 rounded-lg overflow-hidden mb-2 bg-stone-100">
              <img src="${hike.photos![0]}" alt="${hike.title}" class="w-full h-full object-cover" />
            </div>
          `
          : `
            <div class="w-full h-12 rounded-lg mb-2 bg-stone-100 flex items-center justify-center text-stone-500 gap-1.5 border border-stone-200">
              <span class="text-base">${iconEmoji}</span>
              <span class="text-xs font-semibold text-stone-700">${hike.mountainRange}</span>
            </div>
          `;

        const popupContent = `
          <div class="p-1 max-w-[260px] font-sans text-stone-900">
            ${photoBlock}
            <h4 class="font-bold text-sm leading-snug mb-0.5">${hike.title}</h4>
            <div class="text-[11px] text-stone-500 mb-2 flex items-center justify-between">
              <span>📍 ${hike.mountainRange}</span>
              <span>📅 ${hike.date || 'Bez data'}</span>
            </div>
            <div class="grid grid-cols-2 gap-1.5 text-[11px] bg-stone-50 p-2 rounded border border-stone-200 mb-2">
              <div>📏 Délka: <strong>${hike.distanceKm} km</strong></div>
              <div>📈 Převýšení: <strong>+${hike.elevationGainM} m</strong></div>
              <div>⏱️ Čas: <strong>${hike.duration || '—'}</strong></div>
              <div>⛰️ Výška: <strong>${hike.highestPointM ? `${hike.highestPointM} m` : '—'}</strong></div>
            </div>
            <div class="flex gap-1.5">
              <button
                id="popup-highlight-${hike.id}"
                style="flex:1; background:#0f172a; color:#fff; border:none; padding:6px 8px; border-radius:8px; font-weight:600; font-size:11px; cursor:pointer;"
              >
                ${isSelected ? '✓ Vybráno' : 'Zvýraznit trasu'}
              </button>
              <button
                id="popup-open-${hike.id}"
                style="flex:1; background:#059669; color:#fff; border:none; padding:6px 8px; border-radius:8px; font-weight:600; font-size:11px; cursor:pointer;"
              >
                Detail →
              </button>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, { maxWidth: 280 });

        marker.on('popupopen', () => {
          const btnHighlight = document.getElementById(`popup-highlight-${hike.id}`);
          if (btnHighlight) {
            btnHighlight.onclick = () => {
              setActiveHikeId(hike.id);
              if (hike.trackPoints && hike.trackPoints.length > 1) {
                const b = L.latLngBounds(hike.trackPoints.map((p) => [p.lat, p.lng]));
                map.fitBounds(b, { padding: [60, 60] });
              }
            };
          }

          const btnOpen = document.getElementById(`popup-open-${hike.id}`);
          if (btnOpen) {
            btnOpen.onclick = () => {
              onSelectHike(hike);
            };
          }
        });

        marker.on('click', () => {
          setActiveHikeId(hike.id);
        });
      }
    });
  }, [filteredHikes, activeHikeId, mapZoom, onSelectHike]);

  // Handle fit bounds to show all filtered hikes
  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map || filteredHikes.length === 0) return;

    const coords: L.LatLngTuple[] = [];
    filteredHikes.forEach((h) => {
      if (h.peakCoords?.lat && h.peakCoords?.lng) {
        coords.push([h.peakCoords.lat, h.peakCoords.lng]);
      } else if (h.trackPoints && h.trackPoints.length > 0) {
        coords.push([h.trackPoints[0].lat, h.trackPoints[0].lng]);
      }
    });

    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords), { padding: [50, 50], maxZoom: 12 });
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  // Select a hike from the sidebar
  const handleSelectFromSidebar = (hike: MountainHike) => {
    setActiveHikeId(hike.id);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hike.trackPoints && hike.trackPoints.length > 1) {
      const bounds = L.latLngBounds(hike.trackPoints.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
    } else if (hike.peakCoords?.lat && hike.peakCoords?.lng) {
      map.flyTo([hike.peakCoords.lat, hike.peakCoords.lng], 13);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-7.5rem)] min-h-[580px] rounded-2xl overflow-hidden border border-stone-800 shadow-2xl bg-stone-950 flex">
      {/* 1. Left Collapsible Sidebar of Hikes */}
      <div
        className={`h-full bg-stone-950/95 border-r border-stone-800 backdrop-blur-md transition-all duration-300 z-[1001] flex flex-col ${
          isSidebarOpen ? 'w-80 md:w-96' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-stone-800 flex items-center justify-between gap-2 bg-stone-900/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Mountain className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-stone-100">
                Výpravy na mapě ({filteredHikes.length})
              </div>
              <div className="text-[10px] text-stone-400">
                {activeFiltersCount > 0 ? `${activeFiltersCount} aktivní filtry` : 'Všechny záznamy'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 cursor-pointer"
            title="Sbalit postranní panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar List of Hikes */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-900 scrollbar-thin">
          {filteredHikes.length > 0 ? (
            filteredHikes.map((hike) => {
              const isSelected = activeHikeId === hike.id;
              return (
                <div
                  key={hike.id}
                  onClick={() => handleSelectFromSidebar(hike)}
                  className={`p-3 transition-colors cursor-pointer flex gap-3 items-center group ${
                    isSelected
                      ? 'bg-emerald-950/40 border-l-4 border-emerald-500'
                      : 'hover:bg-stone-900/70 border-l-4 border-transparent'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-900 border border-stone-800 shrink-0 flex items-center justify-center text-stone-600">
                    {hike.photos && hike.photos[0] ? (
                      <img
                        src={hike.photos[0]}
                        alt={hike.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Mountain className="w-6 h-6 text-stone-700" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-[10px] text-stone-400 mb-0.5">
                      <span className="truncate text-emerald-400 font-medium">
                        {hike.mountainRange}
                      </span>
                      <span>•</span>
                      <span>{hike.date || '—'}</span>
                    </div>
                    <h4 className="text-xs font-bold text-stone-200 truncate group-hover:text-emerald-400 transition-colors">
                      {hike.title}
                    </h4>
                    <div className="flex items-center gap-3 text-[11px] text-stone-400 mt-1 font-mono">
                      <span>{hike.distanceKm} km</span>
                      <span className="text-emerald-400">+{hike.elevationGainM} m</span>
                      {hike.duration && <span className="text-stone-400 font-sans">{hike.duration}</span>}
                    </div>
                  </div>

                  {/* Open Detail button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectHike(hike);
                    }}
                    className="p-1.5 rounded-lg bg-stone-900 hover:bg-emerald-600 hover:text-white text-stone-400 transition-colors shrink-0"
                    title="Otevřít detail"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-stone-500">
              Žádné výpravy neodpovídají zadaným filtrům.
            </div>
          )}
        </div>
      </div>

      {/* 2. Map Container & Floating Controls */}
      <div className="relative flex-1 h-full">
        {/* Top Control Bar (Clean & Compact) */}
        <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
            {/* Sidebar toggle button */}
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-stone-800 text-xs font-semibold text-stone-200 backdrop-blur-md shadow-xl transition-all cursor-pointer"
              >
                <List className="w-4 h-4 text-emerald-400" />
                <span>Seznam ({filteredHikes.length})</span>
              </button>
            )}

            {/* Filter Toggle Pill */}
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border backdrop-blur-md shadow-xl transition-all cursor-pointer ${
                activeFiltersCount > 0 || isFilterOpen
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-950/50'
                  : 'bg-stone-900/90 text-stone-200 border-stone-800 hover:bg-stone-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtrovat</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-white text-emerald-800 font-extrabold text-[10px] flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Route Mode Toggle */}
            <div className="hidden sm:flex items-center bg-stone-900/90 backdrop-blur-md border border-stone-800 rounded-xl p-0.5 text-xs shadow-xl">
              <button
                type="button"
                onClick={() => setRouteMode('selected-only')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  routeMode === 'selected-only'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Kreslí trasu pouze pro vybranou výpravu (přehledná mapa)"
              >
                Vybraná trasa
              </button>
              <button
                type="button"
                onClick={() => setRouteMode('all-routes')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  routeMode === 'all-routes'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Zobrazí linie všech tras"
              >
                Všechny trasy
              </button>
              <button
                type="button"
                onClick={() => setRouteMode('hidden')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  routeMode === 'hidden'
                    ? 'bg-stone-800 text-stone-300'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
                title="Skryje linie tras (pouze body na mapě)"
              >
                Pouze body
              </button>
            </div>

            {/* Direct Zoom Controls */}
            <div className="flex items-center bg-stone-900/90 backdrop-blur-md border border-stone-800 rounded-xl p-0.5 text-xs shadow-xl">
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1.5 text-stone-300 hover:text-emerald-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                title="Přiblížit mapu (+)"
              >
                <Plus className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-stone-800 mx-0.5" />
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1.5 text-stone-300 hover:text-emerald-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                title="Oddálit mapu (-)"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            {/* Recenter Button */}
            <button
              type="button"
              onClick={handleFitAll}
              className="p-2 bg-stone-900/90 hover:bg-stone-800 text-stone-200 rounded-xl border border-stone-800 backdrop-blur-md shadow-xl transition-all cursor-pointer"
              title="Vycentrovat na všechny výpravy"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating Filter Popover / Card (When user opens "Filtrovat") */}
        {isFilterOpen && (
          <div className="absolute top-14 left-3 right-3 max-w-3xl z-[1002] animate-in fade-in slide-in-from-top-2 duration-200">
            <HikeFilterBar
              filters={filters}
              onChange={setFilters}
              totalHikesCount={hikes.length}
              filteredHikesCount={filteredHikes.length}
              filterOptions={filterOptions}
              isFloatingOnMap={true}
              onCloseMapOverlay={() => setIsFilterOpen(false)}
              onOpenRangeManager={onOpenRangeManager}
            />
          </div>
        )}

        {/* Leaflet Map DOM Element */}
        <div ref={mapContainerRef} className="w-full h-full bg-stone-950" />

        {/* Selected Cluster / Hikes Bottom Sheet */}
        {selectedClusterHikes && (
          <div className="absolute bottom-3 right-3 left-3 sm:left-auto sm:w-[400px] max-h-[75%] z-[1001] bg-stone-900/95 border border-stone-700/80 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden animate-in slide-in-from-bottom-3 duration-200">
            <div className="p-3 bg-stone-950/70 border-b border-stone-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/30">
                  ⛰️
                </div>
                <div className="font-bold text-xs text-stone-100 truncate">
                  {selectedClusterHikes.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClusterHikes(null)}
                className="p-1 text-stone-400 hover:text-stone-100 rounded-lg hover:bg-stone-800 cursor-pointer"
                title="Zavřít"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 space-y-2 overflow-y-auto max-h-72 scrollbar-thin">
              {selectedClusterHikes.hikes.map((hike) => {
                const isSelected = activeHikeId === hike.id;
                return (
                  <div
                    key={hike.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-600/70'
                        : 'bg-stone-950/50 border-stone-800/80 hover:bg-stone-900/70'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-900 border border-stone-800 shrink-0">
                        {hike.photos?.[0] ? (
                          <img
                            src={hike.photos[0]}
                            alt={hike.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-600">
                            <Mountain className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] text-stone-400 mb-0.5">
                          <span className="text-emerald-400 font-medium truncate">{hike.mountainRange}</span>
                          <span>•</span>
                          <span>{hike.date || '—'}</span>
                        </div>
                        <h5 className="text-xs font-bold text-stone-100 truncate">
                          {hike.title}
                        </h5>
                        <div className="flex items-center gap-2 text-[10px] text-stone-300 font-mono mt-1">
                          <span>{hike.distanceKm} km</span>
                          <span className="text-emerald-400">+{hike.elevationGainM} m</span>
                          {hike.duration && <span className="text-stone-400 font-sans">{hike.duration}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-stone-800/60 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveHikeId(hike.id);
                          if (hike.trackPoints && hike.trackPoints.length > 1) {
                            const b = L.latLngBounds(hike.trackPoints.map((p) => [p.lat, p.lng]));
                            mapInstanceRef.current?.fitBounds(b, { padding: [60, 60] });
                          } else if (hike.peakCoords) {
                            mapInstanceRef.current?.flyTo([hike.peakCoords.lat, hike.peakCoords.lng], 14);
                          }
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-center ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-semibold'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                        }`}
                      >
                        {isSelected ? '✓ Trasa zobrazena' : 'Ukázat na mapě'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectHike(hike)}
                        className="py-1.5 px-3 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <span>Detail</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Legend / Stats Pill */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-stone-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-stone-800 text-xs text-stone-300 shadow-xl flex items-center gap-3 pointer-events-none">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <MapPin className="w-3.5 h-3.5" />
            <span>{filteredHikes.length} {filteredHikes.length === 1 ? 'výprava' : 'výprav'}</span>
          </span>
          <span className="text-stone-600 hidden sm:inline">•</span>
          <span className="text-stone-400 hidden sm:inline">
            Číslo v kruhu seskupuje blízké vrcholy (kliknutím rozbalíte seznam)
          </span>
        </div>
      </div>
    </div>
  );
};
