import React, { useState, useRef } from 'react';
import {
  X,
  Calendar,
  Mountain,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Camera,
  ExternalLink,
  Trash2,
  Edit3,
  Upload,
  Footprints,
  Compass,
  AlertCircle,
  Check,
  Plus,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Image as ImageIcon,
} from 'lucide-react';
import { HikeRoute, HikePhotoItem, ActivityType } from '../types';
import { POPULAR_MOUNTAIN_RANGES, detectMountainRangeFromCoords } from '../utils/mountainRanges';
import { ElevationProfile } from './ElevationProfile';
import { PhotoLightbox } from './PhotoLightbox';
import { uploadPhotoToStorage } from '../utils/photoOptimizer';

interface HikeModalProps {
  route: HikeRoute | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (route: Partial<HikeRoute>) => Promise<void>;
  onDelete?: (routeId: string) => Promise<void>;
  canEdit: boolean;
  onRequestUnlock: () => void;
  isNew?: boolean;
}

export const HikeModal: React.FC<HikeModalProps> = ({
  route,
  isOpen,
  onClose,
  onSave,
  onDelete,
  canEdit,
  onRequestUnlock,
  isNew = false,
}) => {
  const [isEditing, setIsEditing] = useState(isNew);
  const [formData, setFormData] = useState<Partial<HikeRoute>>(
    route || {
      title: '',
      mountainRange: 'Krkonoše',
      date: new Date().toISOString().split('T')[0],
      activityType: 'hiking',
      distanceKm: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      highestPointM: 0,
      duration: '',
      description: '',
      externalAlbumUrl: '',
      photos: [],
    }
  );

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [activePhotoDimensions, setActivePhotoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [photoViewMode, setPhotoViewMode] = useState<'featured' | 'grid'>('featured');
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentPhotos = formData.photos || route?.photos || [];

  // Intrinsic dimension resolver: immune to container CSS layout (like w-full h-72 = 624x288)
  useEffect(() => {
    const currentPhoto = currentPhotos[activePhotoIndex] || currentPhotos[0];
    if (!currentPhoto) {
      setActivePhotoDimensions(null);
      return;
    }

    if (typeof currentPhoto === 'object' && currentPhoto.width && currentPhoto.height) {
      setActivePhotoDimensions({ width: currentPhoto.width, height: currentPhoto.height });
      return;
    }

    const src = getPhotoThumbnail(currentPhoto);
    if (!src) {
      setActivePhotoDimensions(null);
      return;
    }

    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth && probe.naturalHeight) {
        setActivePhotoDimensions({ width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.src = src;
  }, [activePhotoIndex, currentPhotos]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!canEdit) {
      onRequestUnlock();
      return;
    }

    setIsUploadingPhotos(true);
    const total = files.length;
    const uploadedPhotos: HikePhotoItem[] = [];

    try {
      for (let i = 0; i < total; i++) {
        const file = files[i];
        setUploadStatus(`Zpracovávám fotografii ${i + 1} z ${total}...`);
        const photoItem = await uploadPhotoToStorage(file, formData.id || route?.id);
        uploadedPhotos.push(photoItem);

        if (photoItem.width && photoItem.width < 1000) {
          alert(
            `Upozornění: Telefon předal zmenšený náhled (${photoItem.width} × ${photoItem.height} px, ${photoItem.sizeKb} KB) namísto plného originálu.\n\nTip pro Android: Při výběru souboru v mobilu neklikejte na „Nedávné / Poslední“ (kde bývají zmenšené náhledy), ale otevřete „Procházet / Soubory / DCIM / Fotoaparát“, kde je uložen skutečný plný originál.`
          );
        }
      }

      setFormData((prev) => ({
        ...prev,
        photos: [...(prev.photos || []), ...uploadedPhotos],
      }));

      // If we are just viewing, save changes immediately to persist photos
      if (!isEditing && route?.id) {
        setUploadStatus('Ukládám trvalý odkaz k výpravě...');
        await onSave({
          ...route,
          photos: [...(route.photos || []), ...uploadedPhotos],
        });
      }

      setUploadStatus('');
    } catch (err: any) {
      console.error('Chyba při nahrávání fotky:', err);
      alert('Chyba při nahrávání fotografie: ' + err.message);
    } finally {
      setIsUploadingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (index: number) => {
    if (!canEdit) {
      onRequestUnlock();
      return;
    }
    if (!confirm('Opravdu chcete tuto fotografii odebrat?')) return;

    const updated = [...currentPhotos];
    const removed = updated.splice(index, 1)[0];

    // If removed photo has an ID on server, delete from /api/photos/:id
    if (typeof removed === 'object' && removed.id) {
      fetch(`/api/photos/${removed.id}`, { method: 'DELETE' }).catch(() => {});
    }

    setFormData((prev) => ({ ...prev, photos: updated }));
    if (!isEditing && route?.id) {
      await onSave({ ...route, photos: updated });
    }
    if (lightboxIndex >= updated.length) {
      setLightboxIndex(Math.max(0, updated.length - 1));
    }
    if (updated.length === 0) {
      setLightboxOpen(false);
    }
  };

  const handleGpxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Send to server parser or parse client side
      const ptRegex = /<(?:trkpt|rtept|wpt)\s+[^>]*lat=["']([^"']+)["']\s+[^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;
      const points: { lat: number; lng: number; ele?: number }[] = [];
      let match;
      let minEle = Infinity;
      let maxEle = -Infinity;

      while ((match = ptRegex.exec(text)) !== null) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(match[3]);
        const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng, ele });
          if (ele !== undefined) {
            if (ele < minEle) minEle = ele;
            if (ele > maxEle) maxEle = ele;
          }
        }
      }

      // Calculate distance
      let totalDist = 0;
      let totalAscent = 0;
      let totalDescent = 0;
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
        const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((p1.lat * Math.PI) / 180) *
            Math.cos((p2.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDist += 6371 * c;

        if (p1.ele !== undefined && p2.ele !== undefined) {
          const diff = p2.ele - p1.ele;
          if (diff > 0.8) totalAscent += diff;
          else if (diff < -0.8) totalDescent += Math.abs(diff);
        }
      }

      // Detect mountain range
      let detectedRange = formData.mountainRange || 'Krkonoše';
      if (points.length > 0) {
        detectedRange = detectMountainRangeFromCoords(points[0].lat, points[0].lng);
      }

      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

      setFormData((prev) => ({
        ...prev,
        title: prev.title || cleanTitle,
        mountainRange: detectedRange,
        distanceKm: Math.round(totalDist * 10) / 10,
        elevationGainM: Math.round(totalAscent),
        elevationLossM: Math.round(totalDescent),
        highestPointM: maxEle !== -Infinity ? Math.round(maxEle) : 0,
        trackpoints: points.length > 2000 ? points.filter((_, idx) => idx % 2 === 0) : points,
        startPoint: points[0],
        endPoint: points[points.length - 1],
      }));
    } catch (err: any) {
      console.error('Chyba při čtení GPX:', err);
      alert('Chyba při zpracování GPX souboru: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      onRequestUnlock();
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        id: formData.id || route?.id || 'route_' + Date.now(),
      });
      setIsEditing(false);
      if (isNew) onClose();
    } catch (err: any) {
      alert('Chyba při ukládání: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getPhotoThumbnail = (photo: string | HikePhotoItem) => {
    if (typeof photo === 'string') {
      if (photo.startsWith('/api/photos/')) {
        return `${photo}?raw=1`;
      }
      return photo;
    }
    // Prioritize direct 4K dataUrl, then rawUrl, then url
    return photo.dataUrl || photo.rawUrl || photo.url || '';
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 md:p-6 overflow-y-auto">
        <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn my-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/90 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-emerald-400">
                <Mountain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">
                  {isNew ? 'Nová horská výprava' : route?.title || 'Detail výpravy'}
                </h2>
                <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                  <span className="text-emerald-400 font-medium">{route?.mountainRange}</span>
                  {route?.date && <span>• {new Date(route.date).toLocaleDateString('cs-CZ')}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing && (
                <button
                  onClick={() => {
                    if (canEdit) {
                      setIsEditing(true);
                      setFormData(route || {});
                    } else {
                      onRequestUnlock();
                    }
                  }}
                  className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition flex items-center gap-1.5 text-xs font-medium"
                  title="Upravit trasu"
                >
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Upravit</span>
                </button>
              )}

              {!isEditing && route?.id && onDelete && (
                <button
                  onClick={() => {
                    if (canEdit) {
                      if (confirm(`Opravdu chcete smazat výpravu "${route.title}"?`)) {
                        onDelete(route.id);
                        onClose();
                      }
                    } else {
                      onRequestUnlock();
                    }
                  }}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/60 rounded-xl transition flex items-center gap-1.5 text-xs font-medium"
                  title="Smazat trasu"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={onClose}
                className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition ml-1"
                title="Zavřít"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
            {!isEditing ? (
              <>
                {/* Metrics ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-stone-950/70 border border-stone-800/80 p-3.5 rounded-2xl">
                    <span className="text-xs text-stone-400 block mb-1">Vzdálenost</span>
                    <span className="text-xl font-bold text-white">{route?.distanceKm || 0} km</span>
                  </div>
                  <div className="bg-stone-950/70 border border-stone-800/80 p-3.5 rounded-2xl">
                    <span className="text-xs text-stone-400 block mb-1">Převýšení</span>
                    <span className="text-xl font-bold text-emerald-400 flex items-center gap-0.5">
                      <ArrowUpRight className="w-4 h-4" /> +{route?.elevationGainM || 0} m
                    </span>
                  </div>
                  <div className="bg-stone-950/70 border border-stone-800/80 p-3.5 rounded-2xl">
                    <span className="text-xs text-stone-400 block mb-1">Nejvyšší bod</span>
                    <span className="text-xl font-bold text-amber-400">
                      {route?.highestPointM || 0} m
                    </span>
                  </div>
                  <div className="bg-stone-950/70 border border-stone-800/80 p-3.5 rounded-2xl">
                    <span className="text-xs text-stone-400 block mb-1">Doba trvání</span>
                    <span className="text-xl font-bold text-stone-300">
                      {route?.duration || '–'}
                    </span>
                  </div>
                </div>

                {/* Elevation profile */}
                {route?.trackpoints && route.trackpoints.length > 1 && (
                  <div>
                    <ElevationProfile
                      trackpoints={route.trackpoints}
                      highestPointM={route.highestPointM}
                      elevationGainM={route.elevationGainM}
                      distanceKm={route.distanceKm}
                    />
                  </div>
                )}

                {/* Photo Gallery Section */}
                <div className="bg-stone-950/50 border border-stone-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Fotogalerie ({currentPhotos.length})
                      </h4>
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/40 font-medium">
                        Originál / 4K kvalita
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentPhotos.length > 1 && (
                        <div className="bg-stone-900 border border-stone-800 p-0.5 rounded-lg flex items-center">
                          <button
                            type="button"
                            onClick={() => setPhotoViewMode('featured')}
                            className={`p-1.5 rounded-md text-xs transition flex items-center gap-1 ${
                              photoViewMode === 'featured'
                                ? 'bg-stone-800 text-emerald-400 font-semibold shadow'
                                : 'text-stone-400 hover:text-white'
                            }`}
                            title="Velký náhled"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Velký náhled</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhotoViewMode('grid')}
                            className={`p-1.5 rounded-md text-xs transition flex items-center gap-1 ${
                              photoViewMode === 'grid'
                                ? 'bg-stone-800 text-emerald-400 font-semibold shadow'
                                : 'text-stone-400 hover:text-white'
                            }`}
                            title="Mřížka všech fotek"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Mřížka</span>
                          </button>
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                        multiple
                        className="hidden"
                        onChange={handlePhotoUpload}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (canEdit) {
                            fileInputRef.current?.click();
                          } else {
                            onRequestUnlock();
                          }
                        }}
                        disabled={isUploadingPhotos}
                        className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Přidat fotky
                      </button>
                    </div>
                  </div>

                  {uploadStatus && (
                    <div className="p-3 bg-emerald-950/50 border border-emerald-800/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-pulse">
                      <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                      <span>{uploadStatus}</span>
                    </div>
                  )}

                  {currentPhotos.length > 0 ? (
                    photoViewMode === 'featured' ? (
                      /* Featured Large Photo View with Thumbnail Strip */
                      <div className="space-y-3">
                        {/* Large Main Photo */}
                        <div
                          onClick={() => {
                            setLightboxIndex(activePhotoIndex);
                            setLightboxOpen(true);
                          }}
                          className="group relative w-full h-72 sm:h-96 md:h-[460px] bg-black/80 rounded-2xl overflow-hidden border border-stone-800 flex items-center justify-center cursor-pointer shadow-xl transition hover:border-emerald-500/80"
                        >
                          <img
                            src={getPhotoThumbnail(currentPhotos[activePhotoIndex] || currentPhotos[0])}
                            alt={`Fotografie ${activePhotoIndex + 1}`}
                            onLoad={(e) => {
                              const el = e.currentTarget;
                              if (el.naturalWidth) {
                                setActivePhotoDimensions({
                                  width: el.naturalWidth,
                                  height: el.naturalHeight,
                                });
                              }
                            }}
                            className="w-full h-full object-contain select-none transition-transform duration-300 group-hover:scale-[1.01]"
                          />

                          {/* Floating Top Controls */}
                          <div className="absolute top-3 left-3 flex items-center gap-2">
                            <div className="bg-black/75 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-stone-200 border border-stone-700/80 flex items-center gap-1.5 shadow">
                              <Camera className="w-3.5 h-3.5 text-emerald-400" />
                              <span>
                                {activePhotoIndex + 1} / {currentPhotos.length}
                              </span>
                            </div>
                            {activePhotoDimensions && (
                              <div
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border shadow backdrop-blur ${
                                  activePhotoDimensions.width === 800 && activePhotoDimensions.height === 369
                                    ? 'bg-amber-950/85 text-amber-300 border-amber-800/80'
                                    : activePhotoDimensions.width >= 3000
                                    ? 'bg-emerald-950/85 text-emerald-300 border-emerald-800/80'
                                    : 'bg-black/75 text-stone-300 border-stone-700/80'
                                }`}
                              >
                                {activePhotoDimensions.width} × {activePhotoDimensions.height} px
                                {activePhotoDimensions.width === 800 && activePhotoDimensions.height === 369
                                  ? ' (Náhled Garmin)'
                                  : activePhotoDimensions.width >= 3800
                                  ? ' (4K Ultra HD)'
                                  : activePhotoDimensions.width >= 1920
                                  ? ' (Full HD)'
                                  : ''}
                              </div>
                            )}
                          </div>

                          <div className="absolute top-3 right-3 bg-black/75 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-medium text-stone-200 border border-stone-700/80 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition shadow">
                            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Celá obrazovka</span>
                          </div>

                          {/* Navigation arrows directly on the large hero image */}
                          {currentPhotos.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActivePhotoIndex((prev) =>
                                    (prev - 1 + currentPhotos.length) % currentPhotos.length
                                  );
                                }}
                                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-stone-200 hover:text-white border border-stone-700/80 transition shadow-lg opacity-80 group-hover:opacity-100"
                                title="Předchozí fotografie"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActivePhotoIndex((prev) =>
                                    (prev + 1) % currentPhotos.length
                                  );
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-stone-200 hover:text-white border border-stone-700/80 transition shadow-lg opacity-80 group-hover:opacity-100"
                                title="Další fotografie"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </>
                          )}

                          {/* Bottom instruction hint */}
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-[11px] text-stone-300 border border-stone-800 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                            Kliknutím otevřete v maximálním rozlišení
                          </div>
                        </div>

                        {/* Interactive Thumbnails Strip */}
                        {currentPhotos.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 custom-scrollbar">
                            {currentPhotos.map((photo, idx) => {
                              const isActive = idx === activePhotoIndex;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => setActivePhotoIndex(idx)}
                                  className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden cursor-pointer border-2 transition ${
                                    isActive
                                      ? 'border-emerald-500 scale-105 shadow-md shadow-emerald-950'
                                      : 'border-stone-800 opacity-60 hover:opacity-100'
                                  }`}
                                >
                                  <img
                                    src={getPhotoThumbnail(photo)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePhoto(idx);
                                        if (activePhotoIndex >= currentPhotos.length - 1) {
                                          setActivePhotoIndex(Math.max(0, currentPhotos.length - 2));
                                        }
                                      }}
                                      className="absolute top-1 right-1 p-1 bg-black/75 hover:bg-red-600 text-stone-300 hover:text-white rounded-md transition shadow"
                                      title="Smazat fotku"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Spacious Grid View */
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {currentPhotos.map((photo, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setLightboxIndex(idx);
                              setLightboxOpen(true);
                            }}
                            className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-black/80 border border-stone-800 cursor-pointer hover:border-emerald-500 transition shadow-lg"
                          >
                            <img
                              src={getPhotoThumbnail(photo)}
                              alt={`Fotografie ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <span className="text-xs text-white font-semibold bg-black/75 px-3 py-1.5 rounded-xl backdrop-blur border border-stone-700 flex items-center gap-1.5">
                                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                                Zvětšit
                              </span>
                            </div>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePhoto(idx);
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-600 text-stone-300 hover:text-white rounded-xl opacity-0 group-hover:opacity-100 transition shadow"
                                title="Smazat fotku"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 border border-dashed border-stone-800 rounded-xl">
                      <Camera className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                      <p className="text-xs text-stone-400">
                        K této výpravě zatím nejsou nahrány žádné fotografie.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 font-semibold underline"
                      >
                        Nahrát první fotky ve vysokém rozlišení
                      </button>
                    </div>
                  )}

                  {/* External album link */}
                  {route?.externalAlbumUrl && (
                    <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                      <span className="text-stone-400">Externí fotogalerie:</span>
                      <a
                        href={route.externalAlbumUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1 hover:underline"
                      >
                        Otevřít kompletní album (Google Fotky / Mapy.cz)
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Description */}
                {route?.description && (
                  <div className="bg-stone-950/50 border border-stone-800 rounded-2xl p-4">
                    <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
                      Zápis z deníku / Poznámky
                    </h4>
                    <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
                      {route.description}
                    </p>
                  </div>
                )}
              </>
            ) : (
              /* Edit / Create Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* GPX Upload button for autofill */}
                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-4 text-center">
                  <input
                    ref={gpxInputRef}
                    type="file"
                    accept=".gpx"
                    onChange={handleGpxFile}
                    className="hidden"
                  />
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-left">
                      <span className="text-sm font-semibold text-emerald-400 block">
                        Importovat trasu z GPX souboru
                      </span>
                      <span className="text-xs text-stone-400">
                        Automaticky dopočítá vzdálenost, převýšení, čas a rozpozná pohoří.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => gpxInputRef.current?.click()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow whitespace-nowrap"
                    >
                      <Upload className="w-4 h-4" />
                      Vybrat GPX
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Název výpravy *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                      placeholder="např. Výstup na Sněžku z Pece"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Pohoří / Oblast *
                    </label>
                    <input
                      type="text"
                      required
                      list="popular-ranges"
                      value={formData.mountainRange || ''}
                      onChange={(e) => setFormData({ ...formData, mountainRange: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                      placeholder="Vyberte nebo zadejte pohoří"
                    />
                    <datalist id="popular-ranges">
                      {POPULAR_MOUNTAIN_RANGES.map((range) => (
                        <option key={range} value={range} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">Datum</label>
                    <input
                      type="date"
                      value={formData.date || ''}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Typ aktivity
                    </label>
                    <select
                      value={formData.activityType || 'hiking'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          activityType: e.target.value as ActivityType,
                        })
                      }
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="hiking">Pěší turistika / Hory</option>
                      <option value="ferrata">Via Ferrata</option>
                      <option value="trail_running">Horský běh</option>
                      <option value="winter">Zimní / Skialpy / Sněžnice</option>
                      <option value="biking">Kolo / Gravel / MTB</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Vzdálenost (km)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.distanceKm || 0}
                      onChange={(e) =>
                        setFormData({ ...formData, distanceKm: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Nastoupáno (m)
                    </label>
                    <input
                      type="number"
                      value={formData.elevationGainM || 0}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          elevationGainM: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Nejvyšší bod (m n.m.)
                    </label>
                    <input
                      type="number"
                      value={formData.highestPointM || 0}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          highestPointM: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Doba trvání
                    </label>
                    <input
                      type="text"
                      value={formData.duration || ''}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                      placeholder="např. 4h 30m"
                    />
                  </div>
                </div>

                {/* External album URL */}
                <div>
                  <label className="text-xs font-medium text-stone-400 block mb-1">
                    Odkaz na externí fotogalerii (Google Fotky, Mapy.cz, Rajče...)
                  </label>
                  <input
                    type="url"
                    value={formData.externalAlbumUrl || ''}
                    onChange={(e) => setFormData({ ...formData, externalAlbumUrl: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="https://photos.app.goo.gl/..."
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-stone-400 block mb-1">
                    Zápis z deníku / Zážitky z cesty
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none resize-none"
                    placeholder="Popište počasí, zážitky na trase, výhledy z vrcholu..."
                  />
                </div>

                {/* Photos upload section */}
                <div className="bg-stone-950/50 border border-stone-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        Fotografie k výpravě ({currentPhotos.length})
                      </span>
                      <span className="text-[11px] text-emerald-400">
                        Ukládá se v originální / 4K Ultra HD kvalitě
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhotos}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Přidat fotky
                    </button>
                  </div>

                  {currentPhotos.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-2">
                      {currentPhotos.map((photo, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-lg overflow-hidden border border-stone-800 group"
                        >
                          <img
                            src={getPhotoThumbnail(photo)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(idx)}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-md opacity-80 hover:opacity-100 transition"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form buttons */}
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isNew) onClose();
                      else setIsEditing(false);
                    }}
                    className="flex-1 py-3 rounded-xl border border-stone-800 text-stone-300 hover:bg-stone-800 text-sm font-medium transition"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {isSaving ? 'Ukládám...' : 'Uložit výpravu'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox for full screen high-res photo viewing */}
      <PhotoLightbox
        photos={currentPhotos}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onDelete={handleDeletePhoto}
        canEdit={canEdit}
      />
    </>
  );
};
