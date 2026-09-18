import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MountainHike, GPXTrackPoint } from '../types';

interface HikeMapProps {
  hike: MountainHike;
  hoveredPoint: GPXTrackPoint | null;
  heightClass?: string;
}

export const HikeMap: React.FC<HikeMapProps> = ({
  hike,
  hoveredPoint,
  heightClass = 'h-72 sm:h-96',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const hoverMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy any existing instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const initialLat = hike.peakCoords?.lat || (hike.trackPoints?.[0]?.lat ?? 50.0);
    const initialLng = hike.peakCoords?.lng || (hike.trackPoints?.[0]?.lng ?? 15.0);

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([initialLat, initialLng], 12);

    // OpenTopoMap tile layer (mountain topographic styling) with fallback to OSM
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution:
        '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>, &copy; <a href="https://openstreetmap.org">OSM</a>',
    });

    const standardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    // Default to Topo layer for mountain terrain
    topoLayer.addTo(map);

    L.control
      .layers(
        {
          'Topografická mapa (Vrstevnice)': topoLayer,
          'Standardní mapa (OSM)': standardLayer,
        },
        {},
        { position: 'topright' }
      )
      .addTo(map);

    // Draw GPX route if points exist
    if (hike.trackPoints && hike.trackPoints.length > 1) {
      const latLngs: L.LatLngTuple[] = hike.trackPoints.map((pt) => [pt.lat, pt.lng]);

      // Outer glow/shadow line
      L.polyline(latLngs, {
        color: '#064e3b',
        weight: 6,
        opacity: 0.7,
      }).addTo(map);

      // Main vibrant track line
      const poly = L.polyline(latLngs, {
        color: '#10b981',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      polylineRef.current = poly;

      // Fit map to route bounds
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [30, 30] });

      // Start marker
      const startPt = hike.trackPoints[0];
      const startIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div class="flex items-center justify-center w-7 h-7 bg-emerald-600 border-2 border-white rounded-full text-white font-bold text-xs shadow-lg transform -translate-x-1/2 -translate-y-1/2">
            S
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([startPt.lat, startPt.lng], { icon: startIcon })
        .bindPopup(`<strong>Start trasy:</strong> ${hike.title}`)
        .addTo(map);

      // Finish marker (if different location)
      const endPt = hike.trackPoints[hike.trackPoints.length - 1];
      const isLoop =
        Math.abs(startPt.lat - endPt.lat) < 0.001 && Math.abs(startPt.lng - endPt.lng) < 0.001;
      if (!isLoop) {
        const finishIcon = L.divIcon({
          className: 'custom-map-icon',
          html: `
            <div class="flex items-center justify-center w-7 h-7 bg-rose-600 border-2 border-white rounded-full text-white font-bold text-xs shadow-lg transform -translate-x-1/2 -translate-y-1/2">
              C
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([endPt.lat, endPt.lng], { icon: finishIcon })
          .bindPopup(`<strong>Cíl trasy:</strong> ${hike.title}`)
          .addTo(map);
      }
    }

    // Peak Marker
    if (hike.peakCoords) {
      const peakIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div class="flex flex-col items-center transform -translate-x-1/2 -translate-y-full cursor-pointer">
            <div class="bg-amber-500 text-stone-950 font-bold px-2 py-0.5 rounded-full text-[11px] shadow-lg border border-amber-300 whitespace-nowrap flex items-center gap-1">
              <span>▲</span>
              <span>${hike.highestPointM ? `${hike.highestPointM} m` : 'Vrchol'}</span>
            </div>
            <div class="w-2.5 h-2.5 bg-amber-500 transform rotate-45 -mt-1 shadow-md"></div>
          </div>
        `,
        iconSize: [60, 40],
        iconAnchor: [30, 40],
      });

      L.marker([hike.peakCoords.lat, hike.peakCoords.lng], { icon: peakIcon })
        .bindPopup(`<strong>${hike.peakCoords.name || hike.title}</strong><br/>Výška: ${hike.highestPointM || 'N/A'} m n. m.`)
        .addTo(map);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [hike]);

  // Handle elevation profile synced hover point
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!hoveredPoint) {
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.remove();
        hoverMarkerRef.current = null;
      }
      return;
    }

    const hoverIcon = L.divIcon({
      className: 'custom-hover-marker',
      html: `
        <div class="relative flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2">
          <div class="absolute w-8 h-8 bg-emerald-400/40 rounded-full animate-ping"></div>
          <div class="w-4 h-4 bg-emerald-400 border-2 border-white rounded-full shadow-lg"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLatLng([hoveredPoint.lat, hoveredPoint.lng]);
    } else {
      hoverMarkerRef.current = L.marker([hoveredPoint.lat, hoveredPoint.lng], {
        icon: hoverIcon,
        zIndexOffset: 1000,
      }).addTo(map);
    }
  }, [hoveredPoint]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-stone-800 shadow-inner">
      <div ref={mapContainerRef} className={`w-full ${heightClass} bg-stone-900`} />
      <div className="absolute bottom-2 left-2 z-20 pointer-events-none bg-stone-900/80 backdrop-blur-sm border border-stone-800 px-2 py-1 rounded text-[11px] text-stone-300">
        Kliknutím můžete mapu posouvat a přibližovat
      </div>
    </div>
  );
};
