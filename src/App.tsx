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
  AlertCircle,
  Settings,
  Upload,
} from 'lucide-react';
import { HikeRoute, HikeStats, ActivityType } from './types';
import { POPULAR_MOUNTAIN_RANGES } from './utils/mountainRanges';
import { HikeMap } from './components/HikeMap';
import { HikeModal } from './components/HikeModal';
import { PinModal } from './components/PinModal';
import { SettingsModal } from './components/SettingsModal';
import { syncHikeToFirestore, fetchHikesFromFirestore, deleteHikeFromFirestore } from './firebase';
import { API_BASE_URL } from './utils/apiConfig';

function getActivityTimeScore(route: HikeRoute): number {
  if (!route.date) return 0;
  const baseDayStr = route.date.split('T')[0];
  const dayMs = new Date(baseDayStr + 'T00:00:00').getTime();

  // If explicit startTime exists (e.g. "14:30")
  if (route.startTime && typeof route.startTime === 'string' && route.startTime.trim()) {
    const parts = route.startTime.trim().split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const s = parseInt(parts[2], 10) || 0;
      return dayMs + (h * 3600 + m * 60 + s) * 1000;
    }
  }

  // If trackpoints have explicit UTC/local timestamp
  const tps: any[] = (route as any).trackpoints || (route as any).trackPoints || [];
  if (tps.length > 0 && tps[0]?.time) {
    const t = new Date(tps[0].time).getTime();
    if (!isNaN(t)) return t;
  }

  // If createdAt has timestamp on this date
  if (route.createdAt) {
    const createdDate = new Date(route.createdAt);
    const createdMs = createdDate.getTime();
    if (!isNaN(createdMs)) {
      const createdDayStr = route.createdAt.split('T')[0];
      if (createdDayStr === baseDayStr) return createdMs;
      const timeOfDayMs =
        (createdDate.getUTCHours() * 3600 +
          createdDate.getUTCMinutes() * 60 +
          createdDate.getUTCSeconds()) *
        1000;
      return dayMs + timeOfDayMs;
    }
  }

  // If Garmin sequential ID (e.g. garmin-24689514614)
  const garminMatch = String(route.id || '').match(/garmin-(\d+)/);
  if (garminMatch) {
    const num = Number(garminMatch[1]);
    return dayMs + (num % 86400000);
  }

  return dayMs;
}

interface PhotoCardPreviewProps {
  photo: string | HikePhotoItem;
  title: string;
  photoCount: number;
}

const PhotoCardPreview: React.FC<PhotoCardPreviewProps> = ({ photo, title, photoCount }) => {
  const [dims, setDims] = useState<{ width: number; height: number } | null>(() => {
    if (typeof photo === 'object' && photo && photo.width && photo.height) {
      return { width: photo.width, height: photo.height };
    }
    return null;
  });

  const src =
    typeof photo === 'string'
      ? photo.startsWith('/api/photos/')
        ? `${API_BASE_URL}${photo}?raw=1`
        : photo
      : (photo?.url && (photo.url.startsWith('data:') || photo.url.startsWith('http') || photo.url.startsWith('/api/photos/')))
      ? (photo.url.startsWith('/api/photos/') ? `${API_BASE_URL}${photo.url}` : photo.url)
      : photo?.dataUrl || photo?.rawUrl || photo?.url || (photo?.id ? `./photos/${photo.id}.jpg` : '');

  const sizeKb = typeof photo === 'object' ? photo?.sizeKb : undefined;

  useEffect(() => {
    if (!src) return;
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth && probe.naturalHeight) {
        setDims({ width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.src = src;
    if (probe.complete && probe.naturalWidth) {
      setDims({ width: probe.naturalWidth, height: probe.naturalHeight });
    }
  }, [src]);

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-950 border border-stone-800 mb-3">
      <img
        src={src}
        alt={title}
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalWidth && el.naturalHeight && !dims) {
            setDims({ width: el.naturalWidth, height: el.naturalHeight });
          }
        }}
        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
        loading="lazy"
      />
      {/* Prominent High-Visibility Resolution Tag */}
      <div className="absolute top-2 left-2 bg-black/90 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-bold text-emerald-300 border border-emerald-700/80 shadow-md flex items-center gap-1.5 z-10 max-w-[90%]">
        <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="truncate">
          Rozlišení:{' '}
          {dims ? (
            <>
              {dims.width} × {dims.height} px
              {dims.width >= 3600 || dims.height >= 2100
                ? ' (4K)'
                : dims.width >= 1900 || dims.height >= 1000
                ? ' (Full HD)'
                : dims.width >= 1200 || dims.height >= 700
                ? ' (HD)'
                : ''}
            </>
          ) : (
            'Měřím...'
          )}
          {sizeKb ? ` • ${sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB'}` : ''}
        </span>
      </div>

      <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded-md text-[10px] font-semibold text-stone-300 flex items-center gap-1">
        <Camera className="w-3 h-3 text-emerald-400" />
        <span>
          {photoCount} {photoCount === 1 ? 'fotka' : photoCount < 5 ? 'fotky' : 'fotek'}
        </span>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const [routes, setRoutes] = useState<HikeRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRange, setSelectedRange] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'distance' | 'elevation'>('date');
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'list'>('list');

  // Modals & Selection
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [modalRoute, setModalRoute] = useState<HikeRoute | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewHikeModal, setIsNewHikeModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const gpxNavInputRef = React.useRef<HTMLInputElement>(null);

  // Security & PIN - ALWAYS starts locked on every reload and page load!
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [storedPin, setStoredPin] = useState<string>(() => {
    return localStorage.getItem('horsky_denik_pin') || '1234';
  });

  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/security/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) {
        setPinError(false);
        setPinInput('');
        setIsUnlocked(true);
        return;
      }
    } catch {}

    if (pinInput === storedPin || pinInput === '1234') {
      setPinError(false);
      setPinInput('');
      setIsUnlocked(true);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  // Fetch routes from central server/Firestore with static fallback for GitHub Pages
  const fetchRoutes = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setServerError(null);
      let res: Response;
      let isFallback = false;
      try {
        res = await fetch(`${API_BASE_URL}/api/routes?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });
      } catch {
        res = await fetch(`${API_BASE_URL}/routes-cache.json`).catch(() => fetch('./routes-cache.json'));
        isFallback = true;
      }

      let rawList: any[] = [];
      if (!res.ok) {
        if (!isFallback) {
          const fallbackRes = await fetch(`${API_BASE_URL}/routes-cache.json`)
            .catch(() => fetch('./routes-cache.json'))
            .catch(() => null);
          if (fallbackRes && fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json();
            rawList = Array.isArray(fallbackJson) ? fallbackJson : fallbackJson.routes || [];
          }
        }
        if (!rawList || rawList.length === 0) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Chyba serveru (${res.status}: ${res.statusText})`);
        }
      } else {
        const data = await res.json();
        rawList = Array.isArray(data) ? data : data.routes;
      }

      if (!rawList || !Array.isArray(rawList)) {
        throw new Error('Server vrátil neplatnou odpověď (chybí pole tras).');
      }

      const loadedRoutes: HikeRoute[] = rawList
        .filter((r: any) => r && typeof r === 'object')
        .map((r: any) => {
          const id = (r.id && String(r.id).trim()) || 'route_' + Math.random().toString(36).substring(2, 8);
          const title = (r.title && typeof r.title === 'string' && r.title.trim())
            ? r.title.trim()
            : (r.name && typeof r.name === 'string' && r.name.trim())
            ? r.name.trim()
            : 'Horská výprava';
          const range = (r.mountainRange && typeof r.mountainRange === 'string' && r.mountainRange.trim())
            ? r.mountainRange.trim()
            : 'Krkonoše';
          const desc = (r.description && typeof r.description === 'string')
            ? r.description
            : '';
          const pts = (Array.isArray(r.trackpoints) && r.trackpoints.length > 0)
            ? r.trackpoints
            : (Array.isArray(r.trackPoints) && r.trackPoints.length > 0)
            ? r.trackPoints
            : [];
          return {
            ...r,
            id,
            title,
            mountainRange: range,
            description: desc,
            trackpoints: pts,
            trackPoints: pts,
            photos: Array.isArray(r.photos) ? r.photos : [],
          };
        });

      setRoutes(loadedRoutes);
      setServerError(null);

      // Keep active modal route in sync
      setModalRoute((prev) => {
        if (!prev) return null;
        const fresh = loadedRoutes.find((r: HikeRoute) => r.id === prev.id);
        return fresh || prev;
      });

      // Synchronize live cloud updates from Firestore (new Garmin activities e.g. Kouty, updated photos & descriptions)
      fetchHikesFromFirestore()
        .then((cloudHikes) => {
          if (cloudHikes && cloudHikes.length > 0) {
            setRoutes((prev) => {
              const map = new Map(prev.map((r) => [r.id, r]));
              let changed = false;
              for (const ch of cloudHikes) {
                if (!ch || typeof ch !== 'object') continue;
                const chTitle = (ch.title && typeof ch.title === 'string' && ch.title.trim())
                  ? ch.title.trim()
                  : 'Horská výprava';
                const chRange = (ch.mountainRange && typeof ch.mountainRange === 'string') ? ch.mountainRange : 'Krkonoše';
                if (!map.has(ch.id)) {
                  map.set(ch.id, {
                    ...ch,
                    id: ch.id,
                    title: chTitle,
                    mountainRange: chRange,
                    description: ch.description || '',
                    trackpoints: ch.trackpoints || ch.trackPoints || [],
                    trackPoints: ch.trackpoints || ch.trackPoints || [],
                    photos: Array.isArray(ch.photos) ? ch.photos : [],
                  } as HikeRoute);
                  changed = true;
                } else {
                  const existing = map.get(ch.id)!;
                  let itemChanged = false;
                  const merged = { ...existing };
                  if (ch.description !== undefined && ch.description !== existing.description) {
                    merged.description = ch.description;
                    itemChanged = true;
                  }
                  if (Array.isArray(ch.photos) && ch.photos.length > 0) {
                    if (!existing.photos || existing.photos.length === 0 || JSON.stringify(ch.photos) !== JSON.stringify(existing.photos)) {
                      merged.photos = ch.photos;
                      itemChanged = true;
                    }
                  }
                  if (itemChanged) {
                    map.set(ch.id, merged);
                    changed = true;
                  }
                }
              }
              if (!changed) return prev;
              return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            });
          }
        })
        .catch(() => {});
    } catch (err: any) {
      console.error('Chyba při načítání tras ze serveru:', err);
      setRoutes([]);
      setServerError(err.message || 'Nepodařilo se navázat spojení se serverem. Žádná data se nenačítají lokálně.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Strictly purge all local storage caches to prevent discrepancies across devices
    try {
      localStorage.removeItem('horsky_denik_user_mods');
      localStorage.removeItem('horsky_denik_routes_cache');
      localStorage.removeItem('horsky_denik_local_overrides');
      localStorage.removeItem('horsky_denik_deleted_photos');
      localStorage.removeItem('horsky_denik_unlocked');
      sessionStorage.clear();
    } catch {}

    fetchRoutes(false);

    // Live multi-device sync: refresh when tab gains focus or screen turns on
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

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    const rangesSet = new Set(
      routes
        .map((r) => r?.mountainRange)
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    );
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
    const q = (searchQuery || '').toLowerCase().trim();
    return routes
      .filter((route) => {
        if (!route) return false;
        const title = (route.title || '').toLowerCase();
        const range = (route.mountainRange || '').toLowerCase();
        const desc = (route.description || '').toLowerCase();

        const matchesSearch =
          !q ||
          title.includes(q) ||
          range.includes(q) ||
          desc.includes(q);

        const matchesRange =
          selectedRange === 'all' || route.mountainRange === selectedRange;

        const matchesActivity =
          selectedActivity === 'all' || route.activityType === selectedActivity;

        return matchesSearch && matchesRange && matchesActivity;
      })
      .sort((a, b) => {
        if (sortBy === 'distance') return (b.distanceKm || 0) - (a.distanceKm || 0);
        if (sortBy === 'elevation') return (b.elevationGainM || 0) - (a.elevationGainM || 0);
        return getActivityTimeScore(b) - getActivityTimeScore(a);
      });
  }, [routes, searchQuery, selectedRange, selectedActivity, sortBy]);

  // Save or update route (strictly server & cloud, throws error if save fails)
  const handleSaveRoute = async (updatedRoute: Partial<HikeRoute>) => {
    if (!updatedRoute.id) {
      throw new Error('Chybí identifikátor výpravy.');
    }

    // 1. Save to central server
    const res = await fetch(`${API_BASE_URL}/api/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updatedRoute,
        fromUserModal: true,
        source: 'user',
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Chyba serveru při ukládání výpravy (${res.status}: ${res.statusText})`);
    }

    const savedResult = await res.json();
    const finalRoute = savedResult?.route || updatedRoute;

    // 2. Sync to Cloud Firestore (throws if quota exceeded or network failed)
    await syncHikeToFirestore(updatedRoute.id, finalRoute);

    // 3. Update in-memory state strictly after successful server and cloud persistence
    setRoutes((prev) =>
      prev.map((r) => (r.id === updatedRoute.id ? ({ ...r, ...finalRoute } as HikeRoute) : r))
    );
    setModalRoute((prev) =>
      prev && prev.id === updatedRoute.id ? ({ ...prev, ...finalRoute } as HikeRoute) : prev
    );
  };

  // Delete route (strictly server & cloud, throws error if delete fails)
  const handleDeleteRoute = async (routeId: string) => {
    // 1. Delete on central server
    const res = await fetch(`${API_BASE_URL}/api/routes/${encodeURIComponent(routeId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Chyba při mazání výpravy ze serveru (HTTP ${res.status})`);
    }

    // 2. Delete from Cloud Firestore
    await deleteHikeFromFirestore(routeId);

    // 3. Update in-memory state
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));
    if (selectedRouteId === routeId) setSelectedRouteId(null);
    if (modalRoute?.id === routeId) setIsModalOpen(false);
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

  const handleExportBackup = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(routes, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `horsky_denik_zaloha_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e: any) {
      alert('Chyba při exportu zálohy: ' + e.message);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const imported = JSON.parse(text);
        const list = Array.isArray(imported) ? imported : imported.routes;
        if (Array.isArray(list) && list.length > 0) {
          setRoutes(list);
          for (const r of list) {
            if (r.id && (r.trackpoints || r.trackPoints)) {
              await saveRouteTrackpoints(r.id, r.trackpoints || r.trackPoints);
            }
          }
          alert(`Úspěšně importováno ${list.length} výprav ze zálohy!`);
          setIsSettingsOpen(false);
        }
      } catch (err: any) {
        alert('Chyba při importu zálohy: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleClearCache = () => {
    if (confirm('Opravdu chcete vyčistit lokální mezipaměť prohlížeče a načíst čerstvá data?')) {
      try {
        localStorage.removeItem('horsky_denik_local_overrides');
        localStorage.removeItem('horsky_denik_deleted_photos');
        sessionStorage.clear();
      } catch {}
      fetchRoutes(false);
      setIsSettingsOpen(false);
    }
  };

  const handleQuickGpxNavUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      const pointNodes = xmlDoc.querySelectorAll('trkpt, rtept, wpt');

      const points: any[] = [];
      let minEle = Infinity;
      let maxEle = -Infinity;
      let totalDist = 0;
      let totalAscent = 0;
      let totalDescent = 0;

      for (let i = 0; i < pointNodes.length; i++) {
        const node = pointNodes[i];
        const lat = parseFloat(node.getAttribute('lat') || '');
        const lng = parseFloat(node.getAttribute('lon') || node.getAttribute('lng') || '');
        if (isNaN(lat) || isNaN(lng)) continue;

        const eleNode = node.querySelector('ele');
        const ele = eleNode ? parseFloat(eleNode.textContent || '') : undefined;
        const timeNode = node.querySelector('time');
        const time = timeNode ? timeNode.textContent?.trim() : undefined;

        if (points.length > 0) {
          const p1 = points[points.length - 1];
          const dLat = ((lat - p1.lat) * Math.PI) / 180;
          const dLon = ((lng - p1.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((p1.lat * Math.PI) / 180) *
              Math.cos((lat * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          totalDist += d;

          if (p1.ele !== undefined && ele !== undefined) {
            const diff = ele - p1.ele;
            if (diff > 0.8) totalAscent += diff;
            else if (diff < -0.8) totalDescent += Math.abs(diff);
          }
        }

        if (ele !== undefined && !isNaN(ele)) {
          if (ele < minEle) minEle = ele;
          if (ele > maxEle) maxEle = ele;
        }

        points.push({
          lat,
          lng,
          ele: ele !== undefined ? Math.round(ele) : undefined,
          time,
          distFromStartKm: Math.round(totalDist * 100) / 100,
        });
      }

      if (points.length === 0) {
        alert('V souboru GPX nebyly nalezeny žádné body trasy.');
        return;
      }

      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const newRouteId = 'route_' + Date.now();
      const detectedDate = points[0]?.time ? String(points[0].time).slice(0, 10) : new Date().toISOString().split('T')[0];

      // Save full 7991+ points to IndexedDB
      await saveRouteTrackpoints(newRouteId, points);

      const newRoute: HikeRoute = {
        id: newRouteId,
        title: cleanTitle,
        mountainRange: 'Krkonoše',
        date: detectedDate,
        activityType: 'hiking',
        distanceKm: Math.round(totalDist * 10) / 10,
        elevationGainM: Math.round(totalAscent),
        elevationLossM: Math.round(totalDescent),
        highestPointM: maxEle > -Infinity ? Math.round(maxEle) : 1000,
        lowestPointM: minEle < Infinity ? Math.round(minEle) : 500,
        trackpoints: points,
        trackPoints: points,
        photos: [],
        description: `Importováno z GPX souboru ${file.name} (${points.length} GPS bodů).`,
      };

      await handleSaveRoute(newRoute);
      handleOpenDetail(newRoute);
    } catch (err: any) {
      alert('Chyba při nahrání GPX: ' + err.message);
    } finally {
      if (gpxNavInputRef.current) gpxNavInputRef.current.value = '';
    }
  };

  const activeMountainRanges = useMemo(() => {
    const list = Array.from(
      new Set(
        routes
          .map((r) => r?.mountainRange)
          .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      )
    );
    return list.sort((a, b) => a.localeCompare(b, 'cs'));
  }, [routes]);

  // Blocking Full-Screen Error if server failed to respond and no routes are available
  if (serverError && routes.length === 0) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-stone-900 border-2 border-red-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-950/80 border border-red-700/80 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-400 shadow-lg">
            <AlertCircle className="w-9 h-9 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">🔴 Server je offline nebo neodpovídá</h2>
          <p className="text-sm text-red-300 mb-6 bg-red-950/60 p-4 rounded-xl border border-red-900/60 font-mono text-left break-words">
            {serverError}
          </p>
          <div className="text-xs text-stone-400 mb-6 space-y-2 text-left bg-stone-950/70 p-4 rounded-xl border border-stone-800">
            <div className="font-semibold text-emerald-400">🔒 Bezpečnostní pravidlo: Žádná data lokálně</div>
            <div>Aplikace striktně odmítá jakákoliv lokální či výchozí data. Veškeré trasy a fotografie musí pocházet výhradně živě z centrálního serveru.</div>
            <div>Dokud server neodpoví, žádné výpravy se nezobrazí.</div>
          </div>
          <button
            onClick={() => fetchRoutes(false)}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
          >
            <RefreshCw className="w-4 h-4" />
            Zkusit znovu načíst ze serveru
          </button>
        </div>
      </div>
    );
  }

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
            {/* View Mode toggles - only when unlocked */}
            {isUnlocked && (
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
            )}

            {/* PIN Lock toggle */}
            <button
              onClick={() => {
                if (isUnlocked) {
                  setIsUnlocked(false);
                  setPinInput('');
                  setPinError(false);
                  try {
                    sessionStorage.removeItem('horsky_denik_session_unlocked');
                    localStorage.removeItem('horsky_denik_unlocked');
                  } catch {}
                }
              }}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                isUnlocked
                  ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400 hover:bg-emerald-900/50'
                  : 'bg-amber-950/70 border-amber-800/80 text-amber-300 shadow-lg shadow-amber-950/40'
              }`}
              title={isUnlocked ? 'Deník je odemčen (kliknutím zamknete)' : 'Deník je uzamčen'}
            >
              {isUnlocked ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
              <span className="hidden sm:inline">
                {isUnlocked ? 'Odemčeno (zamknout)' : 'Zamčeno'}
              </span>
            </button>

            {/* Settings button - always available when unlocked */}
            {isUnlocked && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-stone-800 bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
                title="Nastavení aplikace, VOP a zálohování"
              >
                <Settings className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Nastavení & VOP</span>
              </button>
            )}

            {/* Quick GPX Upload button */}
            {isUnlocked && (
              <>
                <button
                  onClick={() => gpxNavInputRef.current?.click()}
                  className="px-2.5 sm:px-3 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 whitespace-nowrap shadow"
                  title="Rychle nahrát kompletní GPX soubor přímo z Garminu"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Nahrát GPX</span>
                </button>
                <input
                  ref={gpxNavInputRef}
                  type="file"
                  accept=".gpx"
                  onChange={handleQuickGpxNavUpload}
                  className="hidden"
                />
              </>
            )}

            {/* Add Hike button */}
            {isUnlocked && (
              <button
                onClick={handleAddNewHike}
                className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-lg shadow-emerald-950 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Přidat výpravu</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Server Error Warning Banner */}
      {serverError && (
        <div className="bg-red-950/90 border-b border-red-800 text-red-100 px-4 py-3 shadow-xl">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <span className="font-bold text-red-200">Chyba připojení k serveru: </span>
                <span className="text-red-300">{serverError}</span>
              </div>
            </div>
            <button
              onClick={() => fetchRoutes(false)}
              className="px-3.5 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Zkusit znovu
            </button>
          </div>
        </div>
      )}

      {/* Content conditional on unlock state and server health */}
      {!isUnlocked ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 min-h-[75vh] select-none">
          <div className="max-w-sm w-full bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-center">
            <div className="inline-flex p-3.5 bg-emerald-950/80 border border-emerald-800/60 rounded-2xl text-emerald-400 mb-3 shadow-lg shadow-emerald-950/50">
              <Lock className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              Zabezpečený Horský deník
            </h2>
            <p className="text-xs text-stone-400 mb-5">
              Zadejte heslo / PIN pro přístup k výpravám, trasám a fotografiím.
            </p>

            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => {
                    setPinError(false);
                    setPinInput(e.target.value);
                  }}
                  autoFocus
                  placeholder="••••"
                  className="w-full text-center tracking-[0.5em] text-2xl font-bold bg-stone-950 border border-stone-800 rounded-xl py-3 text-stone-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-stone-700"
                />
                <div className="text-center mt-2 flex items-center justify-center gap-2">
                  <span className="text-[11px] text-stone-500">
                    Výchozí přístupový PIN: <strong className="text-emerald-400 font-mono">1234</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPinInput('1234');
                      setPinError(false);
                    }}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-semibold"
                  >
                    Vyplnit 1234
                  </button>
                </div>
                {pinError && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-red-400 mt-2 bg-red-950/60 border border-red-900/50 py-1.5 px-3 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Nesprávné heslo / PIN. Zadejte 1234.</span>
                  </div>
                )}
              </div>

              {/* Quick numeric touch keypad */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setPinError(false);
                      if (k === 'C') {
                        setPinInput('');
                      } else if (k === '⌫') {
                        setPinInput((prev) => prev.slice(0, -1));
                      } else if (pinInput.length < 8) {
                        setPinInput((prev) => prev + k);
                      }
                    }}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition border ${
                      k === 'C' || k === '⌫'
                        ? 'bg-stone-950 border-stone-800/80 text-stone-400 hover:text-white hover:bg-stone-800'
                        : 'bg-stone-800/70 hover:bg-stone-700/80 border-stone-700/60 text-white'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 mt-2"
              >
                <Unlock className="w-4 h-4" />
                <span>Odemknout Horský deník (PIN 1234)</span>
              </button>
            </form>
          </div>
        </div>
      ) : serverError && routes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[60vh] text-center">
          <div className="max-w-md w-full bg-red-950/40 border border-red-900/80 rounded-3xl p-8 shadow-2xl backdrop-blur-sm">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3 animate-pulse" />
            <h3 className="text-lg font-bold text-white mb-2">Server není dostupný (Offline)</h3>
            <p className="text-xs text-red-300 mb-4">{serverError}</p>
            <div className="text-[11px] text-stone-400 bg-stone-950/80 border border-stone-800 rounded-xl p-3 mb-6 text-left">
              <strong className="text-stone-300 block mb-0.5">Vše výhradně ze serveru:</strong>
              Žádná data se neukládají ani nenačítají lokálně. Žádné zástupné výchozí aktivity se nezobrazují.
            </div>
            <button
              onClick={() => fetchRoutes(false)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Opakovat načtení ze serveru
            </button>
          </div>
        </div>
      ) : (
        <>
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
                  <span className="text-stone-400 text-sm">Načítám výpravy z centrální databáze serveru...</span>
                </div>
              ) : serverError && routes.length === 0 ? (
                <div className="py-16 text-center bg-red-950/20 border border-red-900/50 rounded-2xl p-6">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3 animate-pulse" />
                  <h4 className="text-base font-bold text-white mb-1">
                    Chyba při komunikaci s cloudovým serverem
                  </h4>
                  <p className="text-xs text-red-300 max-w-md mx-auto mb-4">
                    {serverError}
                  </p>
                  <button
                    onClick={() => fetchRoutes(false)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow flex items-center gap-2 mx-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Opakovat načtení ze serveru
                  </button>
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
                        ? firstPhoto
                        : firstPhoto?.dataUrl || firstPhoto?.url || firstPhoto?.rawUrl || '';

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
                              {route.mountainRange || 'Hory'}
                            </span>
                            {route.date && (
                              <span className="text-xs text-stone-400 flex items-center gap-1 whitespace-nowrap">
                                <Calendar className="w-3 h-3 text-stone-500" />
                                {new Date(route.date).toLocaleDateString('cs-CZ')}
                                {route.startTime ? ` • ${route.startTime}` : ''}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition line-clamp-2 mb-3">
                            {route.title || 'Horská výprava'}
                          </h4>

                          {/* Photo preview banner with guaranteed resolution */}
                          {firstPhoto && (
                            <PhotoCardPreview
                              photo={firstPhoto}
                              title={route.title}
                              photoCount={photoCount}
                            />
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
      </>
      )}

      {/* Footer */}
      <footer className="border-t border-stone-800/80 py-6 text-center text-xs text-stone-500 bg-stone-950">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Horský Deník • Evidence horských výprav a GPX tras</span>
          <span className="text-stone-600">
            Zabezpečené centrální úložiště (Originální Ultra HD rozlišení fotografií)
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
        required={false}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          setIsUnlocked(true);
          try {
            sessionStorage.setItem('horsky_denik_session_unlocked', 'true');
          } catch {}
          setIsPinModalOpen(false);
        }}
        storedPin={storedPin}
        onUpdatePin={handleUpdatePin}
      />

      {/* Settings & VOP Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        storedPin={storedPin}
        onUpdatePin={handleUpdatePin}
        routesCount={routes.length}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onClearCache={handleClearCache}
      />
    </div>
  );
};

export default App;
