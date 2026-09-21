import React, { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { UserRole, MountainHike, PinConfig } from './types';
import {
  getStoredPins,
  checkUrlKeyForRole,
  resetPinsToDefault,
  savePins,
  getStoredSessionRole,
  saveSessionRole,
  clearSessionRole,
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
  deleteAllHikesFromFirestore,
  seedHikesIfEmpty,
  subscribeToPins,
  savePinsToFirestore,
  getHikeFromFirestore,
  sanitizeHikeForStorage,
} from './utils/firebase';
import { parseUrlSearch } from './utils/garmin';
import { getDateTimestamp } from './utils/dateUtils';
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
import { ImportHistoryModal } from './components/ImportHistoryModal';
import { ConfirmDialog } from './components/ConfirmDialog';

export default function App() {
  // 1. Session & PIN security: Remember login session on the same device
  const [currentRole, setCurrentRole] = useState<UserRole | null>(() => getStoredSessionRole());
  const [isLocked, setIsLocked] = useState<boolean>(() => !getStoredSessionRole());
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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);
  const [hikePendingDelete, setHikePendingDelete] = useState<MountainHike | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

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

  // Firestore real-time subscription
  useEffect(() => {
    // Subscribe to real-time changes
    const unsubscribe = subscribeToHikes(
      (remoteHikes) => {
        const sorted = [...(remoteHikes || [])].sort(
          (a, b) => getDateTimestamp(b.date) - getDateTimestamp(a.date)
        );
        setHikes(sorted);
        saveHikesToStorage(sorted);
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
        saveSessionRole('admin');
      } else if (cleanKey === '0000' || cleanKey === pinConfig.readerPin.trim()) {
        setCurrentRole('reader');
        setIsLocked(false);
        setUrlLockError(null);
        saveSessionRole('reader');
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
    saveSessionRole(role);
  };

  // Immediate lock out
  const handleLock = () => {
    setIsLocked(true);
    setCurrentRole(null);
    clearSessionRole();
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
    saveSessionRole('admin');
  };

  // Hike CRUD handlers with Firestore persistence
  const handleSaveHike = async (savedHike: MountainHike): Promise<void> => {
    const cleanHike = sanitizeHikeForStorage(savedHike);

    setHikes((prevHikes) => {
      const existingIndex = prevHikes.findIndex((h) => h.id === cleanHike.id);
      let updated: MountainHike[];
      if (existingIndex >= 0) {
        updated = [...prevHikes];
        updated[existingIndex] = cleanHike;
      } else {
        updated = [cleanHike, ...prevHikes];
      }
      saveHikesToStorage(updated);
      return updated;
    });

    // Keep selectedHike updated so user immediately sees their saved edits
    setSelectedHike(cleanHike);

    setSaveToast('Změny byly úspěšně uloženy.');
    setTimeout(() => {
      setSaveToast(null);
    }, 3500);

    // Persist to Google Firebase Firestore
    try {
      await saveHikeToFirestore(cleanHike);
      console.log('Výprava úspěšně uložena do Firestore:', cleanHike.id);
    } catch (err) {
      console.warn('Výprava byla uložena v prohlížeči, synchronizace s Firestore hlásí:', err);
    }
  };

  const handleDeleteHike = (hikeId: string) => {
    if (!hikeId) return;
    const cleanId = String(hikeId).trim();
    const updated = hikes.filter((h) => h.id !== cleanId);
    setHikes(updated);
    saveHikesToStorage(updated);

    // Delete from Google Firebase Firestore
    deleteHikeFromFirestore(cleanId).catch((err) =>
      console.warn('Nepodařilo se smazat výpravu z Firebase Firestore:', err)
    );

    if (selectedHike && selectedHike.id === cleanId) {
      setSelectedHike(null);
    }
  };

  const handleConfirmDeleteHike = () => {
    if (hikePendingDelete) {
      handleDeleteHike(hikePendingDelete.id);
      setHikePendingDelete(null);
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

  const handleClearAllHikes = () => {
    setHikes([]);
    saveHikesToStorage([]);
    deleteAllHikesFromFirestore().catch((err) =>
      console.warn('Nepodařilo se vymazat trasy z Firestore:', err)
    );
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
      difficulty: !isNaN(elevationGainM) ? (elevationGainM > 1000 ? 'hard' : elevationGainM < 350 ? 'easy' : 'moderate') : undefined,
      rating: undefined,
      description: `Výprava zaznamenána a synchronizována přes mobilního Telegram bota.\nPočasí: ${weather}`,
      weather,
      photos: [],
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
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-600 selection:text-white relative">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-semibold border border-emerald-400/40 animate-bounce">
          <Check className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

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
            onRequestDelete={(hike) => setHikePendingDelete(hike)}
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
          onRequestDelete={(hike) => setHikePendingDelete(hike)}
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
        onClearAllHikes={handleClearAllHikes}
        onOpenImportHistory={() => setIsImportOpen(true)}
      />

      {/* Bulk History Import Modal */}
      <ImportHistoryModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onHikesImported={() => {
          setSaveToast('Historické výpravy byly úspěšně naimportovány do cloudu.');
          setTimeout(() => setSaveToast(null), 5000);
        }}
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

      {/* Confirm Delete Hike Dialog */}
      <ConfirmDialog
        isOpen={!!hikePendingDelete}
        title="Smazat výpravu z deníku"
        message={
          hikePendingDelete
            ? `Opravdu chcete trvale smazat výpravu „${hikePendingDelete.title}“? Tato akce smaže trasu ze všech vašich zařízení.`
            : ''
        }
        confirmLabel="Trvale smazat"
        cancelLabel="Zrušit"
        isDestructive
        onConfirm={handleConfirmDeleteHike}
        onCancel={() => setHikePendingDelete(null)}
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
