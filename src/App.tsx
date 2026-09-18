import React, { useState, useEffect, useRef } from 'react';
import { UserRole, MountainHike, PinConfig } from './types';
import {
  getStoredPins,
  checkUrlKeyForRole,
  resetPinsToDefault,
  savePins,
} from './utils/auth';
import {
  getStoredHikes,
  saveHikesToStorage,
  resetHikesToDefault,
} from './data/sampleHikes';
import {
  subscribeToHikes,
  saveHikeToFirestore,
  deleteHikeFromFirestore,
  seedHikesIfEmpty,
  subscribeToPins,
  savePinsToFirestore,
  getHikeFromFirestore,
} from './utils/firebase';
import { parseUrlSearch } from './utils/garmin';
import { LockScreen } from './components/LockScreen';
import { Navbar } from './components/Navbar';
import { HikeList } from './components/HikeList';
import { BigOverviewMap } from './components/BigOverviewMap';
import { HikeDetailModal } from './components/HikeDetailModal';
import { HikeFormModal } from './components/HikeFormModal';
import { SwitchToAdminModal } from './components/SwitchToAdminModal';
import { SettingsModal } from './components/SettingsModal';
import { ShareModal } from './components/ShareModal';
import { TelegramModal } from './components/TelegramModal';

export default function App() {
  // 1. Double PIN security: Always start locked by default!
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [pinConfig, setPinConfig] = useState<PinConfig>(getStoredPins);
  const [urlLockError, setUrlLockError] = useState<string | null>(null);

  // 2. Data & Views
  const [hikes, setHikes] = useState<MountainHike[]>(getStoredHikes);
  const [currentView, setCurrentView] = useState<'cards' | 'map'>('cards');
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(true);

  // 3. Modals
  const [selectedHike, setSelectedHike] = useState<MountainHike | null>(null);
  const [hikeToEdit, setHikeToEdit] = useState<MountainHike | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isSwitchToAdminOpen, setIsSwitchToAdminOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);

  // 4. Deep linking & imported GPX state
  const [initialGpxContent, setInitialGpxContent] = useState<{ filename?: string; content: string } | null>(null);
  const [initialHikeData, setInitialHikeData] = useState<Partial<MountainHike> | null>(null);
  const pendingRouteIdRef = useRef<string | null>(null);
  const isEditModeRef = useRef<boolean>(false);
  const hasProcessedNewRouteRef = useRef<boolean>(false);
  const hasProcessedRouteIdRef = useRef<boolean>(false);
  const hasProcessedGpxUrlRef = useRef<boolean>(false);

  // Synchronize PINs from Firestore in real-time
  useEffect(() => {
    const unsubPins = subscribeToPins((remotePins) => {
      setPinConfig(remotePins);
      savePins(remotePins.adminPin, remotePins.readerPin);
    });
    return () => unsubPins();
  }, []);

  // Firestore real-time subscription & initial seeding
  useEffect(() => {
    // 1. Seed initial sample hikes into Firestore if collection is empty
    const initialLocalHikes = getStoredHikes();
    seedHikesIfEmpty(initialLocalHikes).catch((err) =>
      console.warn('Initial Firestore seed check failed:', err)
    );

    // 2. Subscribe to real-time changes
    const unsubscribe = subscribeToHikes(
      (remoteHikes) => {
        if (remoteHikes && remoteHikes.length > 0) {
          const sorted = [...remoteHikes].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          setHikes(sorted);
          saveHikesToStorage(sorted);
        }
        setIsFirestoreConnected(true);
      },
      (err) => {
        console.warn('Firestore connection notice: running with local cache fallback.', err);
        setIsFirestoreConnected(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Check URL parameters (?key=..., ?routeId=..., ?newRoute=..., ?gpxUrl=...) on load & pin updates
  useEffect(() => {
    const urlInfo = parseUrlSearch(window.location.search);

    // 1. Authenticate with ?key=... (supports 1234 or configured Admin PIN, 0000 or Reader PIN)
    if (urlInfo.key) {
      const cleanKey = urlInfo.key.trim();
      if (cleanKey === '1234' || cleanKey === pinConfig.adminPin.trim()) {
        setCurrentRole('admin');
        setIsLocked(false);
        setUrlLockError(null);
      } else if (cleanKey === '0000' || cleanKey === pinConfig.readerPin.trim()) {
        setCurrentRole('reader');
        setIsLocked(false);
        setUrlLockError(null);
      } else {
        setUrlLockError(`Odkaz obsahuje neplatný klíč: "${cleanKey}". Zadejte platné heslo.`);
        setIsLocked(true);
      }
    }

    // 2. Direct route opening: ?edit=XYZ (opens Edit/AI story modal) or ?routeId=XYZ (opens Detail)
    const targetRouteParam = urlInfo.editRouteId || urlInfo.routeId;
    if (targetRouteParam && !hasProcessedRouteIdRef.current) {
      isEditModeRef.current = Boolean(urlInfo.editRouteId);
      pendingRouteIdRef.current = targetRouteParam;
      const targetQuery = targetRouteParam.trim().toLowerCase();

      // Helper to open hike in edit or detail mode
      const openTargetHike = (hike: MountainHike) => {
        setSelectedHike(hike);
        if (isEditModeRef.current) {
          setHikeToEdit(hike);
          setIsFormModalOpen(true);
        }
        hasProcessedRouteIdRef.current = true;
        pendingRouteIdRef.current = null;
      };

      // Check against current local/cached hikes
      const match = hikes.find(
        (h) => h.id.toLowerCase() === targetQuery || h.title.toLowerCase() === targetQuery
      );
      if (match) {
        openTargetHike(match);
      } else {
        // Direct fallback: Fetch document straight from Firestore by ID
        getHikeFromFirestore(targetRouteParam.trim()).then((docHike) => {
          if (docHike && !hasProcessedRouteIdRef.current) {
            openTargetHike(docHike);
            setHikes((prev) => (prev.some((h) => h.id === docHike.id) ? prev : [docHike, ...prev]));
          }
        });
      }
    }

    // 3. Direct new route opening: ?newRoute=true with Garmin prefilled metrics
    if (urlInfo.isNewRoute && !hasProcessedNewRouteRef.current) {
      hasProcessedNewRouteRef.current = true;
      setHikeToEdit(null);
      setInitialHikeData(urlInfo.hikeData);
      setIsFormModalOpen(true);
    }

    // 4. Direct GPX opening: ?gpxUrl=... (from Garmin script or Telegram)
    if (urlInfo.gpxUrl && !hasProcessedGpxUrlRef.current) {
      hasProcessedGpxUrlRef.current = true;
      const targetGpx = urlInfo.gpxUrl;
      const fetchUrl = targetGpx.startsWith('http')
        ? `/api/gpx-proxy?url=${encodeURIComponent(targetGpx)}`
        : targetGpx;

      fetch(fetchUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((xmlText) => {
          if (xmlText && (xmlText.includes('<gpx') || xmlText.includes('<trk') || xmlText.includes('<rte'))) {
            const fileName = targetGpx.split('/').pop()?.split('?')[0] || 'garmin_trasa.gpx';
            setInitialGpxContent({
              filename: fileName,
              content: xmlText,
            });
            setIsFormModalOpen(true);
          }
        })
        .catch((err) => {
          console.warn('Nepodařilo se stáhnout GPX z odkazu:', err);
        });
    }
  }, [pinConfig]);

  // When hikes update from Firestore, check if a route requested in URL is waiting to be opened
  useEffect(() => {
    if (pendingRouteIdRef.current && hikes.length > 0 && !hasProcessedRouteIdRef.current) {
      const targetQuery = pendingRouteIdRef.current.trim().toLowerCase();
      const match = hikes.find(
        (h) => h.id.toLowerCase() === targetQuery || h.title.toLowerCase() === targetQuery
      );
      if (match) {
        setSelectedHike(match);
        if (isEditModeRef.current) {
          setHikeToEdit(match);
          setIsFormModalOpen(true);
        }
        hasProcessedRouteIdRef.current = true;
        pendingRouteIdRef.current = null;
      }
    }
  }, [hikes]);

  // Handle manual unlock from LockScreen
  const handleUnlock = (role: UserRole) => {
    setCurrentRole(role);
    setIsLocked(false);
    setUrlLockError(null);
  };

  // Immediate lock out
  const handleLock = () => {
    setIsLocked(true);
    setCurrentRole(null);
    // Remove ?key=... parameter from URL so it stays locked
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('key');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  // Switch role from Reader to Admin
  const handleSwitchToAdminSuccess = () => {
    setCurrentRole('admin');
  };

  // Hike CRUD handlers with Firestore persistence
  const handleSaveHike = (savedHike: MountainHike) => {
    const existingIndex = hikes.findIndex((h) => h.id === savedHike.id);
    let updated: MountainHike[];
    if (existingIndex >= 0) {
      updated = [...hikes];
      updated[existingIndex] = savedHike;
    } else {
      updated = [savedHike, ...hikes];
    }
    setHikes(updated);
    saveHikesToStorage(updated);

    // Persist to Google Firebase Firestore
    saveHikeToFirestore(savedHike).catch((err) =>
      console.warn('Nepodařilo se uložit výpravu do Firebase Firestore:', err)
    );

    // If modal was open for this hike, update selectedHike
    if (selectedHike && selectedHike.id === savedHike.id) {
      setSelectedHike(savedHike);
    }
  };

  const handleDeleteHike = (hikeId: string) => {
    const updated = hikes.filter((h) => h.id !== hikeId);
    setHikes(updated);
    saveHikesToStorage(updated);

    // Delete from Google Firebase Firestore
    deleteHikeFromFirestore(hikeId).catch((err) =>
      console.warn('Nepodařilo se smazat výpravu z Firebase Firestore:', err)
    );

    if (selectedHike && selectedHike.id === hikeId) {
      setSelectedHike(null);
    }
  };

  const handleResetData = () => {
    const defaults = resetHikesToDefault();
    setHikes(defaults);
    // Reseed Firestore with defaults
    seedHikesIfEmpty(defaults).catch((e) => console.warn('Reseed failed:', e));
    if (selectedHike) {
      setSelectedHike(null);
    }
  };

  // Add hike from Telegram message simulation
  const handleTelegramAddHike = (command: string) => {
    const cleaned = command.replace(/^\/tura\s*/i, '');
    const parts = cleaned.split('|').map((s) => s.trim());
    const title = parts[0] || 'Nová výprava z Telegramu';
    const mountainRange = parts[1] || 'České hory';
    const distanceKm = parseFloat(parts[2]?.replace(/[^0-9.]/g, '') || '12');
    const elevationGainM = parseInt(parts[3]?.replace(/[^0-9]/g, '') || '600', 10);
    const weather = parts[4] || 'Slunečno';

    const newHike: MountainHike = {
      id: `hike-telegram-${Date.now()}`,
      title,
      mountainRange,
      date: new Date().toISOString().split('T')[0],
      distanceKm: isNaN(distanceKm) ? 12 : distanceKm,
      elevationGainM: isNaN(elevationGainM) ? 600 : elevationGainM,
      elevationLossM: isNaN(elevationGainM) ? 600 : elevationGainM,
      duration: '4h 15m',
      difficulty: elevationGainM > 900 ? 'hard' : 'moderate',
      rating: 5,
      description: `Výprava zaznamenána a synchronizována přes mobilního Telegram bota.\nPočasí: ${weather}`,
      weather,
      photos: [
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
      ],
      peakCoords: {
        lat: 49.546,
        lng: 18.448,
        name: title,
      },
    };

    handleSaveHike(newHike);
  };

  // If locked, render LockScreen
  if (isLocked || !currentRole) {
    return (
      <LockScreen
        pinConfig={pinConfig}
        onUnlock={handleUnlock}
        initialError={urlLockError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentRole={currentRole}
        currentView={currentView}
        onViewChange={setCurrentView}
        onLock={handleLock}
        onOpenSwitchToAdmin={() => setIsSwitchToAdminOpen(true)}
        onOpenNewHike={() => {
          setHikeToEdit(null);
          setIsFormModalOpen(true);
        }}
        onOpenShareModal={() => setIsShareOpen(true)}
        onOpenTelegramModal={() => setIsTelegramOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        hikeCount={hikes.length}
        isFirestoreConnected={isFirestoreConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentView === 'cards' ? (
          <HikeList
            hikes={hikes}
            currentRole={currentRole}
            onSelectHike={(hike) => setSelectedHike(hike)}
            onEditHike={(hike) => {
              setHikeToEdit(hike);
              setIsFormModalOpen(true);
            }}
            onDeleteHike={handleDeleteHike}
            onAddNewHike={() => {
              setHikeToEdit(null);
              setIsFormModalOpen(true);
            }}
          />
        ) : (
          <BigOverviewMap
            hikes={hikes}
            onSelectHike={(hike) => setSelectedHike(hike)}
          />
        )}
      </main>

      {/* Hike Detail Modal */}
      {selectedHike && (
        <HikeDetailModal
          hike={selectedHike}
          currentRole={currentRole || 'reader'}
          readerPin={pinConfig.readerPin}
          onClose={() => setSelectedHike(null)}
          onEdit={(hike) => {
            setSelectedHike(null);
            setHikeToEdit(hike);
            setIsFormModalOpen(true);
          }}
          onDelete={handleDeleteHike}
          onUpdateHike={handleSaveHike}
        />
      )}

      {/* Hike Add / Edit Form Modal (Admin only) */}
      {isFormModalOpen && currentRole === 'admin' && (
        <HikeFormModal
          isOpen={isFormModalOpen}
          hikeToEdit={hikeToEdit}
          initialGpxContent={initialGpxContent}
          initialHikeData={initialHikeData}
          onClose={() => {
            setIsFormModalOpen(false);
            setHikeToEdit(null);
            setInitialGpxContent(null);
            setInitialHikeData(null);
          }}
          onSave={handleSaveHike}
        />
      )}

      {/* Switch to Admin Modal (Reader only) */}
      <SwitchToAdminModal
        isOpen={isSwitchToAdminOpen}
        onClose={() => setIsSwitchToAdminOpen(false)}
        pinConfig={pinConfig}
        onSuccess={handleSwitchToAdminSuccess}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        pinConfig={pinConfig}
        currentRole={currentRole}
        onPinsUpdated={setPinConfig}
        onResetData={handleResetData}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        pinConfig={pinConfig}
        currentRole={currentRole}
      />

      {/* Telegram Bot & Mobile Assistant Modal */}
      <TelegramModal
        isOpen={isTelegramOpen}
        onClose={() => setIsTelegramOpen(false)}
        pinConfig={pinConfig}
        currentRole={currentRole}
        onSimulateAddHike={handleTelegramAddHike}
      />

      {/* Footer */}
      <footer className="border-t border-stone-800/80 bg-stone-900/60 py-5 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Horský Deník — Vytvořeno pro horské nadšence & GitHub Pages</span>
          <span>Role: <strong className="text-stone-400 capitalize">{currentRole === 'admin' ? 'Správce (Admin)' : 'Čtenář (Pouze ke čtení)'}</strong></span>
        </div>
      </footer>
    </div>
  );
}
