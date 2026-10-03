import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { HikeRoute } from '../types';
import { Layers } from 'lucide-react';

interface HikeMapProps {
  routes: HikeRoute[];
  selectedRouteId?: string | null;
  onSelectRoute: (routeId: string) => void;
  className?: string;
}

export const HikeMap: React.FC<HikeMapProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  className = 'h-96 w-full rounded-2xl',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Base layers
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      });

      const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenTopoMap',
        maxZoom: 17,
      });

      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; Esri World Imagery',
          maxZoom: 19,
        }
      );

      // Default center: Czech Republic / Central Europe
      const map = L.map(mapContainerRef.current, {
        center: [49.8, 15.5],
        zoom: 8,
        layers: [topo],
      });

      const baseMaps = {
        'Topografická (Turistická)': topo,
        'Základní (OSM)': osm,
        'Satelitní (Letecká)': satellite,
      };

      L.control.layers(baseMaps, undefined, { position: 'topright' }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layerGroupRef.current = layerGroup;
    }

    return () => {
      // Keep map alive or clean on unmount
    };
  }, []);

  // Update routes & track lines
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const allLatLngs: L.LatLng[] = [];

    routes.forEach((route) => {
      const isSelected = route.id === selectedRouteId;
      const pts = route.trackpoints || [];

      if (pts.length > 1) {
        const latLngs = pts.map((p) => L.latLng(p.lat, p.lng));
        allLatLngs.push(...latLngs);

        const polyline = L.polyline(latLngs, {
          color: isSelected ? '#10b981' : '#f59e0b',
          weight: isSelected ? 5 : 3.5,
          opacity: isSelected ? 0.95 : 0.75,
          dashArray: undefined,
        });

        polyline.on('click', () => {
          onSelectRoute(route.id);
        });

        polyline.bindTooltip(
          `<strong>${route.title}</strong><br/>${route.mountainRange} • ${route.distanceKm} km`,
          { sticky: true }
        );

        polyline.addTo(group);

        // Start marker
        if (route.startPoint) {
          const startIcon = L.divIcon({
            html: `<div style="background-color: #10b981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
            className: 'custom-map-pin',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          L.marker([route.startPoint.lat, route.startPoint.lng], { icon: startIcon })
            .bindTooltip(`Start: ${route.title}`)
            .addTo(group);
        }

        // End marker
        if (route.endPoint) {
          const endIcon = L.divIcon({
            html: `<div style="background-color: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
            className: 'custom-map-pin',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          L.marker([route.endPoint.lat, route.endPoint.lng], { icon: endIcon })
            .bindTooltip(`Cíl: ${route.title}`)
            .addTo(group);
        }

        // Highest summit marker
        if (route.highestPointCoords) {
          const peakIcon = L.divIcon({
            html: `<div style="background-color: #f59e0b; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.6);">▲</div>`,
            className: 'custom-map-pin',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          L.marker([route.highestPointCoords.lat, route.highestPointCoords.lng], {
            icon: peakIcon,
          })
            .bindTooltip(
              `Vrchol: ${route.highestPointM} m n.m. (${route.title})`
            )
            .addTo(group);
        }
      }
    });

    // Auto zoom to selected or all
    if (selectedRouteId) {
      const selectedRoute = routes.find((r) => r.id === selectedRouteId);
      if (selectedRoute?.trackpoints && selectedRoute.trackpoints.length > 1) {
        const selectedBounds = L.latLngBounds(
          selectedRoute.trackpoints.map((p) => [p.lat, p.lng])
        );
        map.fitBounds(selectedBounds, { padding: [40, 40], maxZoom: 14 });
      }
    } else if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [routes, selectedRouteId, onSelectRoute]);

  return (
    <div className={`relative overflow-hidden border border-stone-800 shadow-xl ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-3 z-[1000] bg-stone-900/85 backdrop-blur border border-stone-700/80 px-3 py-1.5 rounded-lg text-xs text-stone-300 flex items-center gap-2 shadow-md pointer-events-none">
        <Layers className="w-3.5 h-3.5 text-emerald-400" />
        <span>Vrstvy v pravém horním rohu mapy</span>
      </div>
    </div>
  );
};
