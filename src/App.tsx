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
import {
  syncHikeToFirestore,
  fetchHikesFromFirestore,
  deleteHikeFromFirestore,
  fetchPhotoFromFirestore,
  fetchSecuritySettings,
  saveSecuritySettings,
} from './firebase';
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

  const [firestoreSrc, setFirestoreSrc] = useState<string>('');

  const photoId =
    typeof photo === 'object'
      ? photo?.id
      : typeof photo === 'string' && photo.includes('/api/photos/')
      ? photo.split('/api/photos/')[1].split('?')[0]
      : undefined;
  const directDataUrl = typeof photo === 'object' ? photo?.dataUrl : undefined;

  useEffect(() => {
    if (!directDataUrl && photoId && !firestoreSrc) {
      fetchPhotoFromFirestore(photoId).then((dUrl) => {
        if (dUrl) setFirestoreSrc(dUrl);
      });
    }
  }, [photoId, directDataUrl, firestoreSrc]);

  const src =
    typeof photo === 'string'
      ? photo.startsWith('data:') || photo.startsWith('http')
        ? photo
        : firestoreSrc || (photo.startsWith('/api/photos/') ? `${API_BASE_URL}${photo}?raw=1` : photo)
      : directDataUrl ||
        firestoreSrc ||
        (photo?.url && (photo.url.startsWith('data:') || photo.url.startsWith('http')) ? photo.url : '') ||
        photo?.rawUrl ||
        (photo?.url && photo.url.startsWith('/api/photos/') ? `${API_BASE_URL}${photo.url}` : '') ||
        '';

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
        onError={() => {
          if (photoId && !firestoreSrc) {
            fetchPhotoFromFirestore(photoId).then((dUrl) => {
              if (dUrl) setFirestoreSrc(dUrl);
            });
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

  // Global Roles: 'admin' (full write/edit/delete access) or 'reader' (view-only access)
  const [userRole, setUserRole] = useState<'admin' | 'reader' | null>(() => {
    return (localStorage.getItem('horsky_denik_auth_role') as 'admin' | 'reader' | null) || null;
  });
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return !!localStorage.getItem('horsky_denik_auth_role');
  });
  const [adminPin, setAdminPin] = useState<string>('0303');
  const [readerPin, setReaderPin] = useState<string>('1234');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const canEdit = isUnlocked && userRole === 'admin';

  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = pinInput.trim();
    if (!clean) return;

    const currentAdminPin = adminPin || '0303';
    const currentReaderPin = readerPin || '1234';

    if (clean === currentAdminPin) {
      setUserRole('admin');
      setIsUnlocked(true);
      setPinError(false);
      setPinInput('');
      localStorage.setItem('horsky_denik_auth_role', 'admin');
      localStorage.setItem('horsky_denik_auth_pin', clean);
      return;
    }

    if (clean === currentReaderPin) {
      setUserRole('reader');
      setIsUnlocked(true);
      setPinError(false);
      setPinInput('');
      localStorage.setItem('horsky_denik_auth_role', 'reader');
      localStorage.setItem('horsky_denik_auth_pin', clean);
      return;
    }

    setPinError(true);
    setPinInput('');
  };

  const handleLock = () => {
    setUserRole(null);
    setIsUnlocked(false);
    setPinInput('');
    setPinError(false);
    localStorage.removeItem('horsky_denik_auth_role');
    localStorage.removeItem('horsky_denik_auth_pin');
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
                  if (Array.isArray(ch.photos)) {
                    if (!existing.photos || JSON.stringify(ch.photos) !== JSON.stringify(existing.photos)) {
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
              const nextList = Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
              setModalRoute((cur) => {
                if (!cur) return null;
                return nextList.find((r) => r.id === cur.id) || cur;
              });
              return nextList;
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
    } catch {}

    fetchRoutes(false);

    // Synchronize global security PINs and verify remembered device session
    fetchSecuritySettings().then((sec) => {
      setAdminPin(sec.adminPin);
      setReaderPin(sec.readerPin);

      const savedPin = localStorage.getItem('horsky_denik_auth_pin');
      const savedRole = localStorage.getItem('horsky_denik_auth_role');
      if (savedPin && savedRole) {
        if (savedPin === sec.adminPin) {
          setUserRole('admin');
          setIsUnlocked(true);
        } else if (savedPin === sec.readerPin) {
          setUserRole('reader');
          setIsUnlocked(true);
        } else {
          setUserRole(null);
          setIsUnlocked(false);
          localStorage.removeItem('horsky_denik_auth_role');
          localStorage.removeItem('horsky_denik_auth_pin');
        }
      }
    });

    // Mobile Android Back button listener: closes modals instead of exiting webpage
    const handlePopState = () => {
      setIsModalOpen(false);
      setIsSettingsOpen(false);
      setIsPinModalOpen(false);
    };
    window.addEventListener('popstate', handlePopState);

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
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleUpdatePins = async (newAdminPin: string, newReaderPin: string) => {
    await saveSecuritySettings({ adminPin: newAdminPin, readerPin: newReaderPin });
    setAdminPin(newAdminPin);
    setReaderPin(newReaderPin);
    if (userRole === 'admin') {
      localStorage.setItem('horsky_denik_auth_pin', newAdminPin);
    } else if (userRole === 'reader') {
      localStorage.setItem('horsky_denik_auth_pin', newReaderPin);
    }
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

  // Save or update route (persists directly to central server and syncs to Cloud Firestore)
  const handleSaveRoute = async (updatedRoute: Partial<HikeRoute>) => {
    if (!updatedRoute.id) {
      throw new Error('Chybí identifikátor výpravy.');
    }

    let finalRoute = updatedRoute;

    // 1. Authoritative Persistence: Save directly to central server storage first (permanent, no quota limits)
    try {
      const serverEndpoint = API_BASE_URL ? `${API_BASE_URL}/api/routes` : '/api/routes';
      const res = await fetch(serverEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatedRoute,
          fromUserModal: true,
          source: 'user',
        }),
      });
      if (res.ok) {
        const savedResult = await res.json().catch(() => null);
        if (savedResult?.route) {
          finalRoute = savedResult.route;
        }
      }
    } catch (serverErr) {
      console.warn('[handleSaveRoute] Server save varování:', serverErr);
    }

    // 2. Also sync to Cloud Firestore in background (safe against quota issues)
    try {
      await syncHikeToFirestore(updatedRoute.id, finalRoute);
    } catch (dbErr: any) {
      console.warn('[handleSaveRoute] Firestore varování (data jsou uložena na serveru):', dbErr?.message);
    }

    // 3. Update in-memory state immediately
    setRoutes((prev) =>
      prev.map((r) => (r.id === updatedRoute.id ? ({ ...r, ...finalRoute } as HikeRoute) : r))
    );
    setModalRoute((prev) =>
      prev && prev.id === updatedRoute.id ? ({ ...prev, ...finalRoute } as HikeRoute) : prev
    );
  };

  // Delete route (strictly cloud & server, throws error if delete fails)
  const handleDeleteRoute = async (routeId: string) => {
    // 1. Delete from Cloud Firestore
    await deleteHikeFromFirestore(routeId);

    // 2. Also notify local server if available
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const serverEndpoint = API_BASE_URL
        ? `${API_BASE_URL}/api/routes/${encodeURIComponent(routeId)}`
        : `/api/routes/${encodeURIComponent(routeId)}`;
      await fetch(serverEndpoint, {
        method: 'DELETE',
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {}

    // 3. Update in-memory state
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));
    if (selectedRouteId === routeId) setSelectedRouteId(null);
    if (modalRoute?.id === routeId) setIsModalOpen(false);
  };

  const handleOpenDetail = (route: HikeRoute) => {
    window.history.pushState({ modal: 'hikeDetail', id: route.id }, '');
    setModalRoute(route);
    setSelectedRouteId(route.id);
    setIsNewHikeModal(false);
    setIsModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsModalOpen(false);
    if (window.history.state?.modal === 'hikeDetail') {
      window.history.back();
    }
  };

  const handleOpenSettings = () => {
    window.history.pushState({ modal: 'settings' }, '');
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    if (window.history.state?.modal === 'settings') {
      window.history.back();
    }
  };

  const handleAddNewHike = () => {
    if (!canEdit) {
      alert('Pouze správce (administrátor) může přidávat nové výpravy. Přihlaste se heslem správce.');
      handleLock();
      return;
    }
    window.history.pushState({ modal: 'hikeDetail', id: 'new' }, '');
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

            {/* Role indicator badge */}
            {isUnlocked && (
              <div
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                  userRole === 'admin'
                    ? 'bg-amber-950/70 border-amber-700/60 text-amber-300'
                    : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                }`}
                title={userRole === 'admin' ? 'Přihlášen jako Správce (plná práva)' : 'Přihlášen jako Čtenář (pouze pro čtení)'}
              >
                {userRole === 'admin' ? (
                  <>
                    <span>👑</span>
                    <span className="hidden sm:inline">Správce</span>
                  </>
                ) : (
                  <>
                    <span>📖</span>
                    <span className="hidden sm:inline">Čtenář</span>
                  </>
                )}
              </div>
            )}

            {/* PIN Lock toggle */}
            <button
              onClick={handleLock}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                isUnlocked
                  ? 'bg-stone-900 border-stone-800 text-stone-300 hover:text-white hover:bg-stone-800'
                  : 'bg-amber-950/70 border-amber-800/80 text-amber-300 shadow-lg shadow-amber-950/40'
              }`}
              title={isUnlocked ? 'Odhlásit a uzamknout na tomto zařízení' : 'Deník je uzamčen'}
            >
              {isUnlocked ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
              <span className="hidden sm:inline">
                {isUnlocked ? 'Zamknout' : 'Zamčeno'}
              </span>
            </button>

            {/* Settings button - always available when unlocked */}
            {isUnlocked && (
              <button
                onClick={handleOpenSettings}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-stone-800 bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
                title="Nastavení aplikace, hesla a VOP"
              >
                <Settings className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Nastavení & Hesla</span>
              </button>
            )}

            {/* Quick GPX Upload button - Admin only */}
            {canEdit && (
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

            {/* Add Hike button - Admin only */}
            {canEdit && (
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
              Horský deník
            </h2>
            <p className="text-xs text-stone-400 mb-5">
              Zadejte přístupové heslo nebo PIN pro vstup do deníku.
            </p>

            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={12}
                  value={pinInput}
                  onChange={(e) => {
                    setPinError(false);
                    setPinInput(e.target.value);
                  }}
                  autoFocus
                  placeholder="••••"
                  className="w-full text-center tracking-[0.5em] text-2xl font-bold bg-stone-950 border border-stone-800 rounded-xl py-3 text-stone-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-stone-700"
                />

                {pinError && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-red-400 mt-3 bg-red-950/60 border border-red-900/50 py-1.5 px-3 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Nesprávné heslo / PIN. Přístup byl odepřen.</span>
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
                <span>Vstoupit do Horského deníku</span>
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
        {(() => {
          const renderCards = (isFullWidth: boolean) => {
            if (loading) {
              return (
                <div className="py-20 text-center">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <span className="text-stone-400 text-sm">Načítám výpravy z centrální databáze serveru...</span>
                </div>
              );
            }
            if (serverError && routes.length === 0) {
              return (
                <div className="py-16 text-center bg-red-950/20 border border-red-900/50 rounded-2xl p-6">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3 animate-pulse" />
                  <h4 className="text-base font-bold text-white mb-1">
                    Chyba při komunikaci s cloudovým serverem
                  </h4>
                  <p className="text-xs text-red-300 max-w-md mx-auto mb-4">{serverError}</p>
                  <button
                    onClick={() => fetchRoutes(false)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow flex items-center gap-2 mx-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Opakovat načtení ze serveru
                  </button>
                </div>
              );
            }
            if (filteredRoutes.length === 0) {
              return (
                <div className="py-16 text-center bg-stone-900/40 border border-dashed border-stone-800 rounded-2xl">
                  <Mountain className="w-10 h-10 text-stone-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-stone-300">Nenalezena žádná výprava</p>
                  <p className="text-xs text-stone-500 mt-1">
                    Zkuste upravit vyhledávací filtr nebo přidejte novou výpravu přes tlačítko v záhlaví.
                  </p>
                </div>
              );
            }

            const gridClass = isFullWidth
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'grid grid-cols-1 sm:grid-cols-2 gap-4';

            return (
              <div className={gridClass}>
                {filteredRoutes.map((route) => {
                  const isSelected = route.id === selectedRouteId;
                  const photoCount = Array.isArray(route.photos) ? route.photos.length : 0;
                  const firstPhoto = photoCount > 0 ? route.photos![0] : null;

                  return (
                    <div
                      key={route.id}
                      onClick={() => handleOpenDetail(route)}
                      className={`group bg-stone-900/80 border rounded-2xl p-4 sm:p-5 cursor-pointer transition flex flex-col justify-between hover:border-emerald-500/80 hover:shadow-xl hover:shadow-black/50 ${
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
                            <span className="text-xs font-bold text-white">{route.distanceKm} km</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-stone-500 block">Převýšení</span>
                            <span className="text-xs font-bold text-emerald-400">+{route.elevationGainM} m</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-stone-500 block">Nejvyšší bod</span>
                            <span className="text-xs font-bold text-amber-400">{route.highestPointM} m</span>
                          </div>
                        </div>
                      </div>

                      {/* Card footer */}
                      <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                        <span className="text-stone-400 flex items-center gap-1">
                          {photoCount > 0 ? (
                            <span className="text-emerald-400 font-medium">
                              {photoCount} {photoCount === 1 ? 'fotka' : photoCount < 5 ? 'fotky' : 'fotek'}
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
            );
          };

          if (viewMode === 'map') {
            return (
              <div className="space-y-4">
                <HikeMap
                  routes={filteredRoutes}
                  selectedRouteId={selectedRouteId}
                  onSelectRoute={(id) => {
                    setSelectedRouteId(id);
                    const found = routes.find((r) => r.id === id);
                    if (found) handleOpenDetail(found);
                  }}
                  className="h-[78vh] w-full rounded-2xl"
                />
              </div>
            );
          }

          if (viewMode === 'split') {
            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Map Column: on desktop sticky on right, on mobile top banner */}
                <div className="lg:col-span-5 lg:order-2 lg:sticky lg:top-20 z-0">
                  <div className="bg-stone-900/60 border border-stone-800/80 rounded-2xl p-2.5 shadow-xl">
                    <div className="flex items-center justify-between px-2 py-1 mb-1.5 text-xs text-stone-400">
                      <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5" />
                        Mapa výprav ({filteredRoutes.length})
                      </span>
                      <span className="text-[11px] text-stone-500">Kliknutím otevřete detail</span>
                    </div>
                    <HikeMap
                      routes={filteredRoutes}
                      selectedRouteId={selectedRouteId}
                      onSelectRoute={(id) => {
                        setSelectedRouteId(id);
                        const found = routes.find((r) => r.id === id);
                        if (found) handleOpenDetail(found);
                      }}
                      className="h-64 sm:h-80 lg:h-[calc(100vh-140px)] w-full rounded-xl"
                    />
                  </div>
                </div>

                {/* Cards List Column: cleanly scrollable on left, 100% visible, never overlapped */}
                <div className="lg:col-span-7 lg:order-1 space-y-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                      <span>Výpravy ({filteredRoutes.length})</span>
                    </h3>
                  </div>
                  {renderCards(false)}
                </div>
              </div>
            );
          }

          // viewMode === 'list' (Seznam)
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                  <span>Výpravy ({filteredRoutes.length})</span>
                </h3>
              </div>
              {renderCards(true)}
            </div>
          );
        })()}
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
        onClose={handleCloseDetail}
        onSave={handleSaveRoute}
        onDelete={handleDeleteRoute}
        canEdit={canEdit}
        onRequestUnlock={handleLock}
        isNew={isNewHikeModal}
      />

      {/* Settings & VOP Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        adminPin={adminPin}
        readerPin={readerPin}
        onUpdatePins={handleUpdatePins}
        routesCount={routes.length}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onClearCache={handleClearCache}
      />
    </div>
  );
};

export default App;
