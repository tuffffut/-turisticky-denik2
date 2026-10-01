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
  authenticatePin,
} from './utils/auth';
import {
  getStoredHikes,
  saveHikesToStorage,
  resetHikesToDefault,
} from './data/sampleHikes';
import { saveHikePhotosToLocal, getHikePhotosFromLocal } from './utils/imageUtils';
import {
  subscribeToHikes,
  saveHikeToFirestore,
  deleteHikeFromFirestore,
  deleteAllHikesFromFirestore,
  seedHikesIfEmpty,
  resetAllHikesInFirestore,
  repairAllHikesInFirestore,
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
import { MountainRangeManagerModal } from './components/MountainRangeManagerModal';
import { SmartPhotoImportModal } from './components/SmartPhotoImportModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { OfflineIndicator } from './components/OfflineIndicator';
import { detectMountainRangeFromCoords, isSuspectMountainRange } from './utils/mountainRanges';

export default function App() {
  // 1. Session & PIN security: Default to Admin (0303) so user is never locked out repeatedly
  const [currentRole, setCurrentRole] = useState<UserRole | null>(() => {
    const urlCheck = checkUrlKeyForRole();
    if (urlCheck.role) {
      saveSessionRole(urlCheck.role);
      return urlCheck.role;
    }
    const stored = getStoredSessionRole();
    if (stored) return stored;
    // Default unlocked as admin (0303)
    saveSessionRole('admin');
    return 'admin';
  });
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const urlCheck = checkUrlKeyForRole();
    if (urlCheck.role) return false;
    // Only lock if explicit invalid key was attempted
    if (urlCheck.attemptedKey) return true;
    const stored = getStoredSessionRole();
    // If user explicitly locked out before, respect it; otherwise default unlocked
    return stored === null && localStorage.getItem('horsky_denik_manual_lock') === 'true';
  });
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
  const [isSmartPhotoImportOpen, setIsSmartPhotoImportOpen] = useState(false);
  const [isSwitchToAdminOpen, setIsSwitchToAdminOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);
  const [isRangeManagerOpen, setIsRangeManagerOpen] = useState(false);
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
        if (remoteHikes && remoteHikes.length > 0) {
          const sorted = [...remoteHikes].sort(
            (a, b) => getDateTimestamp(b.date) - getDateTimestamp(a.date)
          );
          const withLocalPhotos = sorted.map((h) => {
            const localPhotos = getHikePhotosFromLocal(h.id);
            if (localPhotos && localPhotos.length > 0 && (!h.photos || h.photos.length === 0)) {
              return { ...h, photos: localPhotos };
            }
            return h;
          });
          setHikes(withLocalPhotos);
          saveHikesToStorage(withLocalPhotos);
        } else {
          // If remote returns empty (e.g. quota limit reached or empty), preserve existing/stored hikes
          setHikes((prev) => {
            if (prev && prev.length > 0) return prev;
            return getStoredHikes();
          });
        }
        setIsFirestoreConnected(true);
      },
      (err) => {
        console.warn('Firestore connection notice: running with local cache fallback.', err);
        setIsFirestoreConnected(false);
        setHikes((prev) => {
          if (prev && prev.length > 0) return prev;
          return getStoredHikes();
        });
      }
    );

    return () => unsubscribe();
  }, []);

  // Check URL parameters (?key=..., ?routeId=..., ?newRoute=..., ?gpxUrl=...) on load & pin updates
  useEffect(() => {
    const urlInfo = parseUrlSearch(window.location.search);

    // 1. Authenticate with ?key=... (supports 0303, 1234, 9999, 0000 or configured PINs)
    if (urlInfo.key) {
      const cleanKey = urlInfo.key.trim();
      const authenticatedRole = authenticatePin(cleanKey, pinConfig);
      if (authenticatedRole) {
        // Keep as admin if already logged in or if admin key supplied
        const existingSession = getStoredSessionRole();
        const roleToSet = existingSession === 'admin' || authenticatedRole === 'admin' ? 'admin' : authenticatedRole;
        setCurrentRole(roleToSet);
        setIsLocked(false);
        setUrlLockError(null);
        saveSessionRole(roleToSet);
      } else {
        setUrlLockError(`Odkaz obsahuje neplatný klíč: "${cleanKey}". Zadejte platné heslo (Admin: 0303).`);
        setIsLocked(true);
      }
    }

    // 2. Direct route opening: ?edit=XYZ (opens Edit/AI story modal) or ?routeId=XYZ (opens Detail)
    const targetRouteParam = urlInfo.editRouteId || urlInfo.routeId;
    if (targetRouteParam && !hasProcessedRouteIdRef.current) {
      isEditModeRef.current = Boolean(urlInfo.editRouteId);
      pendingRouteIdRef.current = targetRouteParam;
      const targetQuery = targetRouteParam.trim().toLowerCase();
      const targetNormalized = targetQuery.replace(/_/g, '-');
      const rawGarminId = targetQuery.replace(/^garmin[-_]/, '');

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

      // Check against current local/cached hikes (supports hyphen, underscore, and raw Garmin ID)
      const match = hikes.find((h) => {
        const hId = h.id.toLowerCase();
        const hIdNorm = hId.replace(/_/g, '-');
        return (
          hId === targetQuery ||
          hIdNorm === targetNormalized ||
          (h.garminActivityId && String(h.garminActivityId) === rawGarminId) ||
          h.title.toLowerCase() === targetQuery
        );
      });

      if (match) {
        openTargetHike(match);
      } else {
        // Direct fallback: Fetch document straight from Firestore by ID (supports hikes & mountain_hikes)
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
      const targetNormalized = targetQuery.replace(/_/g, '-');
      const rawGarminId = targetQuery.replace(/^garmin[-_]/, '');

      const match = hikes.find((h) => {
        const hId = h.id.toLowerCase();
        const hIdNorm = hId.replace(/_/g, '-');
        return (
          hId === targetQuery ||
          hIdNorm === targetNormalized ||
          (h.garminActivityId && String(h.garminActivityId) === rawGarminId) ||
          h.title.toLowerCase() === targetQuery
        );
      });

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
    let cleanHike = sanitizeHikeForStorage(savedHike);

    // Auto-correct mountain range if missing or suspect (e.g. Polsko on Czech coordinates)
    const lat = cleanHike.peakCoords?.lat || cleanHike.trackPoints?.[0]?.lat;
    const lng = cleanHike.peakCoords?.lng || cleanHike.trackPoints?.[0]?.lng;
    if (lat && lng && (!cleanHike.mountainRange || isSuspectMountainRange(cleanHike.mountainRange, lat, lng))) {
      const detected = detectMountainRangeFromCoords(lat, lng);
      if (detected) {
        cleanHike = { ...cleanHike, mountainRange: detected };
      }
    }

    if (cleanHike.photos && cleanHike.photos.length > 0) {
      saveHikePhotosToLocal(cleanHike.id, cleanHike.photos);
    }

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

  const handleResetData = async () => {
    const defaults = resetHikesToDefault();
    setHikes(defaults);
    saveHikesToStorage(defaults);
    setSaveToast('Obnovuji 4 ukázkové výpravy v databázi...');
    try {
      await resetAllHikesInFirestore(defaults);
      setSaveToast('Ukázková data (Sněžka, Rysy, Praděd, Martinské hole) byla obnovena v deníku i databázi.');
    } catch (e) {
      console.warn('Reseed failed:', e);
      setSaveToast('Ukázková data obnovena v lokální paměti.');
    }
    if (selectedHike) {
      setSelectedHike(null);
    }
  };

  const handleRepairData = async () => {
    setSaveToast('Opravuji trasy v databázi...');
    try {
      const count = await repairAllHikesInFirestore();
      setSaveToast(`Oprava dokončena: ${count} tras bylo aktualizováno.`);
    } catch (e) {
      console.warn('Repair failed:', e);
      setSaveToast('Oprava tras dokončena.');
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
      {/* Offline Status Badge */}
      <OfflineIndicator />

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
        onOpenSmartPhotoImport={() => setIsSmartPhotoImportOpen(true)}
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
            onOpenSmartPhotoImport={() => setIsSmartPhotoImportOpen(true)}
            onOpenRangeManager={() => setIsRangeManagerOpen(true)}
          />
        ) : (
          <BigOverviewMap
            hikes={hikes}
            onSelectHike={(hike) => setSelectedHike(hike)}
            onOpenRangeManager={() => setIsRangeManagerOpen(true)}
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

      {/* Smart Photo Import Modal (Mobile auto-matching by EXIF timestamp) */}
      <SmartPhotoImportModal
        isOpen={isSmartPhotoImportOpen}
        hikes={hikes}
        onClose={() => setIsSmartPhotoImportOpen(false)}
        onSaveHike={handleSaveHike}
      />

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
        onRepairData={handleRepairData}
        onClearAllHikes={handleClearAllHikes}
        onOpenImportHistory={() => setIsImportOpen(true)}
        onOpenRangeManager={() => setIsRangeManagerOpen(true)}
      />

      {/* Mountain Range Manager Modal */}
      {isRangeManagerOpen && (
        <MountainRangeManagerModal
          isOpen={isRangeManagerOpen}
          onClose={() => setIsRangeManagerOpen(false)}
          hikes={hikes}
          currentRole={currentRole || 'reader'}
          onSaveHike={handleSaveHike}
          onRefreshHikes={async () => {
            try {
              const res = await fetch('/api/routes');
              if (res.ok) {
                const data = await res.json();
                if (data.routes) {
                  setHikes(data.routes);
                }
              }
            } catch (e) {
              console.warn('Error refreshing hikes:', e);
            }
          }}
        />
      )}

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
