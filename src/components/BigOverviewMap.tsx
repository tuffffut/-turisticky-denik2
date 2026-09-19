import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Mountain, Layers, Eye, Compass, Maximize2 } from 'lucide-react';
import { MountainHike } from '../types';

interface BigOverviewMapProps {
  hikes: MountainHike[];
  onSelectHike: (hike: MountainHike) => void;
}

const ROUTE_COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#eab308'];

export const BigOverviewMap: React.FC<BigOverviewMapProps> = ({
  hikes,
  onSelectHike,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [selectedRange, setSelectedRange] = useState<string>('all');
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const markersRef = useRef<L.Marker[]>([]);

  // Unique mountain ranges
  const mountainRanges = ['all', ...Array.from(new Set(hikes.map((h) => h.mountainRange)))];

  const filteredHikes =
    selectedRange === 'all'
      ? hikes
      : hikes.filter((h) => h.mountainRange === selectedRange);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Default view centered on Czech/Slovak mountain region
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([50.0, 16.5], 7);

    // OpenTopoMap layer
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

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers and polylines when hikes or filters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old markers & polylines
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    routeLayersRef.current.forEach((r) => r.remove());
    routeLayersRef.current = [];

    const allCoords: L.LatLngTuple[] = [];

    filteredHikes.forEach((hike, idx) => {
      const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];

      // Draw Route Polylines
      if (showRoutes && hike.trackPoints && hike.trackPoints.length > 1) {
        const latLngs: L.LatLngTuple[] = hike.trackPoints.map((p) => [p.lat, p.lng]);
        latLngs.forEach((c) => allCoords.push(c));

        const poly = L.polyline(latLngs, {
          color,
          weight: 4,
          opacity: 0.85,
          dashArray: undefined,
        }).addTo(map);

        poly.bindTooltip(
          `<strong>${hike.title}</strong><br/>${hike.distanceKm} km | +${hike.elevationGainM} m`,
          { sticky: true }
        );

        poly.on('click', () => {
          onSelectHike(hike);
        });

        routeLayersRef.current.push(poly);
      }

      // Hike Marker on Big Overview Map
      const markerLat = (hike.trackPoints && hike.trackPoints.length > 0)
        ? hike.trackPoints[0].lat
        : hike.peakCoords?.lat;
      const markerLng = (hike.trackPoints && hike.trackPoints.length > 0)
        ? hike.trackPoints[0].lng
        : hike.peakCoords?.lng;

      if (typeof markerLat === 'number' && typeof markerLng === 'number') {
        allCoords.push([markerLat, markerLng]);

        const hikePinIcon = L.divIcon({
          className: 'big-map-peak-icon',
          html: `
            <div class="flex flex-col items-center transform -translate-x-1/2 -translate-y-full cursor-pointer group">
              <div class="bg-stone-900/95 text-stone-100 font-bold px-2.5 py-1 rounded-lg text-xs shadow-xl border-2 border-emerald-500/80 whitespace-nowrap flex items-center gap-1.5 hover:scale-105 transition-transform max-w-[180px]">
                <span class="text-emerald-400">⛰️</span>
                <span class="truncate">${hike.title}</span>
                <span class="text-[10px] text-emerald-300/80 font-normal shrink-0">${hike.distanceKm} km</span>
              </div>
              <div class="w-3 h-3 bg-stone-900 border-r-2 border-b-2 border-emerald-500/80 transform rotate-45 -mt-1.5 shadow-md"></div>
            </div>
          `,
          iconSize: [160, 48],
          iconAnchor: [80, 48],
        });

        const marker = L.marker([markerLat, markerLng], { icon: hikePinIcon }).addTo(map);

        // Custom rich HTML popup
        const photoUrl = hike.photos?.[0] || 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=80';
        const popupContent = `
          <div class="p-1 max-w-[260px] text-stone-900 font-sans">
            <div class="w-full h-28 rounded-lg overflow-hidden mb-2 bg-stone-200">
              <img src="${photoUrl}" alt="${hike.title}" class="w-full h-full object-cover" />
            </div>
            <h4 class="font-bold text-sm leading-snug mb-1">${hike.title}</h4>
            <div class="text-xs text-stone-600 mb-2 flex items-center gap-2">
              <span>📍 ${hike.mountainRange}</span>
              <span>⭐ ${hike.rating}/5</span>
            </div>
            <div class="grid grid-cols-2 gap-1 text-[11px] bg-stone-100 p-2 rounded mb-2">
              <div>📏 Vzdálenost: <strong>${hike.distanceKm} km</strong></div>
              <div>📈 Převýšení: <strong>+${hike.elevationGainM} m</strong></div>
              <div>⏱️ Čas: <strong>${hike.duration}</strong></div>
              <div>⛰️ Výška: <strong>${hike.highestPointM || 'N/A'} m</strong></div>
            </div>
            <button
              id="popup-open-hike-${hike.id}"
              style="width:100%; background:#059669; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-weight:600; font-size:12px; cursor:pointer;"
            >
              Zobrazit detail výpravy →
            </button>
          </div>
        `;

        marker.bindPopup(popupContent, { maxWidth: 280 });

        marker.on('popupopen', () => {
          const btn = document.getElementById(`popup-open-hike-${hike.id}`);
          if (btn) {
            btn.onclick = () => {
              onSelectHike(hike);
            };
          }
        });

        markersRef.current.push(marker);
      }
    });

    // Auto fit bounds to show all markers/routes
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [filteredHikes, showRoutes, onSelectHike]);

  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map || filteredHikes.length === 0) return;

    const coords: L.LatLngTuple[] = [];
    filteredHikes.forEach((h) => {
      if (h.peakCoords) coords.push([h.peakCoords.lat, h.peakCoords.lng]);
      h.trackPoints?.forEach((p) => coords.push([p.lat, p.lng]));
    });

    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-8rem)] min-h-[500px] rounded-2xl overflow-hidden border border-stone-800 shadow-2xl bg-stone-900">
      {/* Top Floating Filter Bar */}
      <div className="absolute top-3 left-3 right-16 sm:right-auto z-[1000] flex flex-wrap items-center gap-2 bg-stone-900/90 backdrop-blur-md p-2 rounded-xl border border-stone-800 shadow-xl max-w-xl">
        <div className="flex items-center gap-1.5 text-xs text-stone-300 font-semibold px-1">
          <Compass className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Pohoří:</span>
        </div>

        {/* Range filter chips */}
        <div className="flex flex-wrap gap-1">
          {mountainRanges.map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedRange === range
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {range === 'all' ? 'Všechna pohoří' : range}
            </button>
          ))}
        </div>

        {/* Toggle routes visibility */}
        <button
          onClick={() => setShowRoutes(!showRoutes)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ml-auto ${
            showRoutes
              ? 'bg-stone-800 text-emerald-400 border-emerald-500/30'
              : 'bg-stone-950 text-stone-500 border-stone-800'
          }`}
          title="Zobrazit či skrýt linie tras"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Trasy</span>
        </button>

        {/* Fit Bounds Button */}
        <button
          onClick={handleFitAll}
          className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg border border-stone-700 transition-colors cursor-pointer"
          title="Vycentrovat všechny vrcholy"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full bg-stone-950" />

      {/* Bottom info stats bar */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-stone-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-stone-800 text-xs text-stone-300 shadow-lg flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-medium">
          <Mountain className="w-4 h-4 text-emerald-400" />
          <span>{filteredHikes.length} {filteredHikes.length === 1 ? 'vrchol' : 'vrcholů'} na mapě</span>
        </span>
        <span className="text-stone-500 hidden sm:inline">|</span>
        <span className="text-stone-400 hidden sm:inline">
          Kliknutím na vrchol zobrazíte podrobnosti
        </span>
      </div>
    </div>
  );
};
