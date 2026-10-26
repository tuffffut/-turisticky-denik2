import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Camera,
  Calendar,
  Clock,
  Check,
  AlertCircle,
  Trash2,
  Sparkles,
  Image as ImageIcon,
  ArrowRight,
  RefreshCw,
  FolderCheck,
} from 'lucide-react';
import { HikeRoute, HikePhotoItem } from '../types';
import { PhotoInfo, analyzePhotoFile, matchPhotosToRoutes } from '../utils/photoDateMatcher';
import { uploadPhotoToStorage } from '../utils/photoOptimizer';
import { updateHikePhotosInFirestore } from '../firebase';
import { API_BASE_URL } from '../utils/apiConfig';

interface BatchPhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  routes: HikeRoute[];
  onBatchSaved: (updatedRoutesMap: Map<string, (string | HikePhotoItem)[]>) => void;
  initialFiles?: File[] | null;
}

export const BatchPhotoUploadModal: React.FC<BatchPhotoUploadModalProps> = ({
  isOpen,
  onClose,
  routes,
  onBatchSaved,
  initialFiles,
}) => {
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; status: string }>({
    current: 0,
    total: 0,
    status: '',
  });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Process any initial files passed from App.tsx
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      handleFilesSelected(initialFiles);
    }
  }, [isOpen, initialFiles]);

  if (!isOpen) return null;

  const handleFilesSelected = async (files: FileList | File[]) => {
    const rawList = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (rawList.length === 0) return;

    setIsAnalyzing(true);
    try {
      const analyzed: PhotoInfo[] = [];
      for (const file of rawList) {
        const item = await analyzePhotoFile(file);
        analyzed.push(item);
      }
      const matched = matchPhotosToRoutes(analyzed, routes);
      setPhotos((prev) => [...prev, ...matched]);
    } catch (err: any) {
      console.error('Chyba při analýze fotografií:', err);
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleReassignPhoto = (photoId: string, newRouteId: string | undefined) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p;
        if (!newRouteId) {
          return { ...p, matchedRouteId: undefined, matchReason: 'Odebráno z výpravy' };
        }
        const targetRoute = routes.find((r) => r.id === newRouteId);
        return {
          ...p,
          matchedRouteId: newRouteId,
          matchReason: `Ručně přiřazeno k: ${targetRoute?.title || newRouteId}`,
        };
      })
    );
  };

  const handleClearAll = () => {
    photos.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setPhotos([]);
  };

  // Group photos by route
  const assignedPhotos = photos.filter((p) => p.matchedRouteId);
  const unassignedPhotos = photos.filter((p) => !p.matchedRouteId);

  const groupsByRouteId = new Map<string, PhotoInfo[]>();
  assignedPhotos.forEach((p) => {
    const rId = p.matchedRouteId!;
    const list = groupsByRouteId.get(rId) || [];
    list.push(p);
    groupsByRouteId.set(rId, list);
  });

  const handleStartUpload = async () => {
    if (assignedPhotos.length === 0) return;

    setIsUploading(true);
    const total = assignedPhotos.length;
    let completed = 0;

    // Collect new photos per route
    const newItemsPerRoute = new Map<string, HikePhotoItem[]>();

    try {
      for (const photo of assignedPhotos) {
        completed++;
        setUploadProgress({
          current: completed,
          total,
          status: `Optimalizuji a nahrávám fotku ${completed} z ${total} (${photo.name})...`,
        });

        const targetRouteId = photo.matchedRouteId!;
        const uploadedItem = await uploadPhotoToStorage(photo.file, targetRouteId);

        const list = newItemsPerRoute.get(targetRouteId) || [];
        list.push(uploadedItem);
        newItemsPerRoute.set(targetRouteId, list);
      }

      setUploadProgress({
        current: total,
        total,
        status: 'Synchronizuji výpravy s cloudem a serverem...',
      });

      // Update each route in Firestore and local state
      const updatedRoutesMap = new Map<string, (string | HikePhotoItem)[]>();

      for (const [routeId, newPhotos] of newItemsPerRoute.entries()) {
        const routeObj = routes.find((r) => r.id === routeId);
        const existingPhotos = routeObj?.photos || [];
        const mergedPhotos = [...existingPhotos, ...newPhotos];

        updatedRoutesMap.set(routeId, mergedPhotos);

        // 1. Persist directly to Firestore
        try {
          await updateHikePhotosInFirestore(routeId, mergedPhotos);
        } catch (dbErr: any) {
          console.warn(`[BatchUpload] Firestore varování pro ${routeId}:`, dbErr?.message);
        }

        // 2. Persist to server if available
        try {
          const endpoint = API_BASE_URL ? `${API_BASE_URL}/api/routes` : '/api/routes';
          const leanPhotos = mergedPhotos.map((p) => {
            if (typeof p === 'object' && p !== null) {
              const { dataUrl: _discard, ...rest } = p;
              return {
                ...rest,
                id: p.id,
                url: p.url && !p.url.startsWith('data:') ? p.url : `/api/photos/${p.id}`,
                rawUrl: p.rawUrl && !p.rawUrl.startsWith('data:') ? p.rawUrl : `/api/photos/${p.id}?raw=1`,
              };
            }
            return p;
          });

          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...routeObj,
              id: routeId,
              photos: leanPhotos,
            }),
          });
        } catch (serverErr) {
          console.warn(`[BatchUpload] Server varování pro ${routeId}:`, serverErr);
        }
      }

      // Notify parent to update memory state
      onBatchSaved(updatedRoutesMap);

      const affectedCount = newItemsPerRoute.size;
      setFeedback({
        type: 'success',
        title: '✅ Fotografie úspěšně přiřazeny a uloženy',
        message: `Úspěšně nahráno a do cloudu uloženo ${total} fotografií pro ${affectedCount} ${
          affectedCount === 1 ? 'výpravu' : affectedCount < 5 ? 'výpravy' : 'výprav'
        }.`,
      });

      // Clear uploaded photos from queue
      setPhotos((prev) => prev.filter((p) => !p.matchedRouteId));
    } catch (err: any) {
      console.error('Chyba při hromadném nahrávání fotek:', err);
      setFeedback({
        type: 'error',
        title: '❌ Chyba při nahrávání fotografií',
        message: err.message || 'Nepodařilo se dokončit ukládání fotografií do cloudu.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Hromadné nahrání fotografií k výpravám</span>
                <span className="text-xs bg-emerald-950 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                  Auto-detekce podle data a času
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Aplikace přečte datum a čas pořízení z EXIF metadat a automaticky fotky přiřadí k odpovídající aktivitě.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Dropzone & File Selector */}
          <div
            ref={dropzoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                : 'border-stone-800 bg-stone-950/40 hover:border-emerald-500/60 hover:bg-stone-900/60 text-stone-300'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
              className="hidden"
            />
            <div className="p-3 bg-stone-800/80 rounded-2xl text-emerald-400 mb-1 border border-stone-700">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">
              Vyberte nebo přetáhněte fotografie (i desítky najednou)
            </p>
            <p className="text-xs text-stone-400 max-w-md">
              Podporuje JPG, PNG, WebP i HEIC z mobilu či fotoaparátu. Web sám zjistí datum a čas pořízení z EXIF metadat.
            </p>
          </div>

          {/* Analyzing indicator */}
          {isAnalyzing && (
            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
              <span className="text-xs sm:text-sm text-stone-300 font-medium">
                Čtu EXIF metadata a páruji fotografie s výpravami...
              </span>
            </div>
          )}

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
                  : 'bg-red-950/70 border-red-800 text-red-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {feedback.type === 'success' ? (
                  <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-sm font-bold">{feedback.title}</h4>
                  <p className="text-xs mt-0.5 opacity-90">{feedback.message}</p>
                </div>
              </div>
              <button
                onClick={() => setFeedback(null)}
                className="text-stone-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload Progress banner */}
          {isUploading && (
            <div className="bg-emerald-950/60 border border-emerald-800/80 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-emerald-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  {uploadProgress.status}
                </span>
                <span className="font-bold text-white">
                  {Math.round((uploadProgress.current / (uploadProgress.total || 1)) * 100)} %
                </span>
              </div>
              <div className="w-full bg-stone-950 rounded-full h-2.5 overflow-hidden border border-emerald-900/60">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / (uploadProgress.total || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Matched Groups List */}
          {groupsByRouteId.size > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderCheck className="w-4 h-4 text-emerald-400" />
                  <span>Automaticky spárované výpravy ({assignedPhotos.length} fotek)</span>
                </h3>
                <button
                  onClick={handleClearAll}
                  disabled={isUploading}
                  className="text-xs text-stone-500 hover:text-red-400 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vyčistit vše</span>
                </button>
              </div>

              {Array.from(groupsByRouteId.entries()).map(([routeId, groupPhotos]) => {
                const route = routes.find((r) => r.id === routeId);
                if (!route) return null;

                return (
                  <div
                    key={routeId}
                    className="bg-stone-950/80 border border-stone-800 rounded-2xl p-4 space-y-3"
                  >
                    {/* Route header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/80 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                            {route.mountainRange || 'Hory'}
                          </span>
                          <span className="text-xs text-stone-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-stone-500" />
                            {new Date(route.date).toLocaleDateString('cs-CZ')}
                            {route.startTime ? ` • ${route.startTime}` : ''}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">{route.title}</h4>
                      </div>
                      <div className="text-xs font-semibold text-stone-300 bg-stone-900 px-2.5 py-1 rounded-lg border border-stone-800 self-start sm:self-center">
                        {groupPhotos.length} {groupPhotos.length === 1 ? 'fotka' : groupPhotos.length < 5 ? 'fotky' : 'fotek'}
                      </div>
                    </div>

                    {/* Photo previews in this group */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
                      {groupPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="group relative bg-stone-900 border border-stone-800 rounded-xl overflow-hidden aspect-video flex flex-col justify-between shadow"
                        >
                          <img
                            src={photo.previewUrl}
                            alt={photo.name}
                            className="w-full h-full object-cover"
                          />

                          {/* Time badge */}
                          <div className="absolute top-1.5 left-1.5 bg-black/85 backdrop-blur px-2 py-0.5 rounded text-[10px] font-semibold text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-emerald-400" />
                            <span>{photo.timeStr ? photo.timeStr.slice(0, 5) : photo.dateStr}</span>
                          </div>

                          {/* Delete button */}
                          <button
                            onClick={() => handleRemovePhoto(photo.id)}
                            disabled={isUploading}
                            className="absolute top-1.5 right-1.5 p-1 bg-black/80 hover:bg-red-950 hover:text-red-300 text-stone-400 rounded-md transition opacity-0 group-hover:opacity-100"
                            title="Odebrat fotografii"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>

                          {/* Match reason label on hover */}
                          <div className="absolute inset-x-0 bottom-0 bg-black/90 p-1.5 text-[9px] text-stone-300 truncate">
                            {photo.matchReason || photo.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Unassigned Photos Section */}
          {unassignedPhotos.length > 0 && (
            <div className="space-y-3 bg-amber-950/20 border border-amber-900/40 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="text-sm font-bold text-amber-300">
                  Nespárované fotografie ({unassignedPhotos.length})
                </h3>
              </div>
              <p className="text-xs text-stone-400">
                U těchto fotografií se v deníku nenašla výprava se stejným datem. Můžete je přiřadit ručně k vybrané výpravě nebo je vynechat.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {unassignedPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="bg-stone-900 border border-stone-800 rounded-xl p-2.5 flex flex-col justify-between gap-2"
                  >
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-stone-950">
                      <img
                        src={photo.previewUrl}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => handleRemovePhoto(photo.id)}
                        className="absolute top-1 right-1 p-1 bg-black/80 hover:bg-red-950 text-stone-400 hover:text-red-300 rounded"
                        title="Odebrat"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-[11px] text-stone-300">
                      <div className="font-semibold truncate">{photo.name}</div>
                      <div className="text-stone-400 flex items-center gap-1 text-[10px] mt-0.5">
                        <Calendar className="w-3 h-3 text-stone-500" />
                        <span>{photo.dateStr || 'Neznámé datum'}</span>
                        {photo.timeStr && <span>• {photo.timeStr.slice(0, 5)}</span>}
                      </div>
                    </div>

                    {/* Manual route assignment dropdown */}
                    <select
                      value={photo.matchedRouteId || ''}
                      onChange={(e) => handleReassignPhoto(photo.id, e.target.value || undefined)}
                      className="bg-stone-950 border border-stone-800 rounded-lg p-1.5 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Přiřadit k výpravě...</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.date?.slice(0, 10)} - {r.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {photos.length === 0 && !isAnalyzing && (
            <div className="py-10 text-center text-stone-500 space-y-2">
              <ImageIcon className="w-10 h-10 mx-auto text-stone-700" />
              <p className="text-xs">Zatím nebyly vybrány žádné fotografie.</p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="p-4 sm:p-5 border-t border-stone-800 bg-stone-950/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-stone-400 text-center sm:text-left">
            {assignedPhotos.length > 0 ? (
              <span>
                Připraveno k nahrání: <strong className="text-white">{assignedPhotos.length} fotografií</strong> pro{' '}
                <strong className="text-emerald-400">{groupsByRouteId.size} výprav</strong>.
              </span>
            ) : (
              <span>Vyberte fotografie pro automatické přiřazení k výpravám.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="flex-1 sm:flex-initial px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-xs font-semibold transition"
            >
              Zavřít
            </button>

            <button
              onClick={handleStartUpload}
              disabled={isUploading || assignedPhotos.length === 0}
              className={`flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg ${
                isUploading || assignedPhotos.length === 0
                  ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
              }`}
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Nahrávám ({uploadProgress.current}/{uploadProgress.total})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Uložit {assignedPhotos.length} fotografií do cloudu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
