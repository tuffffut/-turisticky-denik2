import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Calendar,
  Clock,
  Sparkles,
  Check,
  AlertCircle,
  HelpCircle,
  Trash2,
  Star,
  ChevronDown,
  Loader2,
  ArrowRight,
  ImageIcon,
  Plus,
  Compass,
} from 'lucide-react';
import { MountainHike } from '../types';
import { parsePhotoFile, ParsedPhotoInfo } from '../utils/exifReader';
import { resizeImageFile } from '../utils/imageUtils';
import { formatDateDisplay } from '../utils/dateUtils';

interface SmartPhotoImportModalProps {
  isOpen: boolean;
  hikes: MountainHike[];
  onClose: () => void;
  onSaveHike: (updatedHike: MountainHike) => Promise<void> | void;
}

interface PhotoMatchGroup {
  hike: MountainHike;
  photos: ParsedPhotoInfo[];
  coverPhotoId?: string;
}

export const SmartPhotoImportModal: React.FC<SmartPhotoImportModalProps> = ({
  isOpen,
  hikes,
  onClose,
  onSaveHike,
}) => {
  const [parsedPhotos, setParsedPhotos] = useState<ParsedPhotoInfo[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState<{ done: number; total: number } | null>(null);

  const [savingProgress, setSavingProgress] = useState<{ done: number; total: number; currentHike: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URLs when modal unmounts or photos change
  useEffect(() => {
    return () => {
      parsedPhotos.forEach((p) => {
        if (p.thumbnailUrl) URL.revokeObjectURL(p.thumbnailUrl);
      });
    };
  }, [parsedPhotos]);

  if (!isOpen) return null;

  // Handle file selection from phone or computer
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsAnalyzing(true);
    setSaveSuccess(null);

    const total = files.length;
    setAnalyzingProgress({ done: 0, total });

    const newParsedList: ParsedPhotoInfo[] = [];

    for (let i = 0; i < total; i++) {
      const file = files[i];
      try {
        const info = await parsePhotoFile(file);

        // Match with hikes by date
        const photoDateStr = info.dateString;
        let matched = hikes.find((h) => h.date === photoDateStr);

        // If no exact match, look for +/- 1 day (e.g. overnight hike or timezone)
        let confidence: 'exact_date' | 'close_date' | 'unmatched' = 'unmatched';
        if (matched) {
          confidence = 'exact_date';
        } else {
          const photoTimestamp = info.captureDate.getTime();
          const oneDayMs = 24 * 60 * 60 * 1000;
          const closeHike = hikes.find((h) => {
            const hikeTime = new Date(`${h.date}T12:00:00`).getTime();
            return Math.abs(hikeTime - photoTimestamp) <= oneDayMs;
          });
          if (closeHike) {
            matched = closeHike;
            confidence = 'close_date';
          }
        }

        if (matched) {
          info.matchedHikeId = matched.id;
          info.matchedHikeTitle = matched.title;
          info.matchedConfidence = confidence;
        } else {
          info.matchedConfidence = 'unmatched';
        }

        newParsedList.push(info);
      } catch (err) {
        console.warn('Chyba při čtení fotky:', file.name, err);
      }
      setAnalyzingProgress({ done: i + 1, total });
    }

    setParsedPhotos((prev) => [...prev, ...newParsedList]);
    setIsAnalyzing(false);
    setAnalyzingProgress(null);

    // Reset input so user can pick more photos if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove photo from import list
  const handleRemovePhoto = (photoId: string) => {
    setParsedPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target?.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl);
      return prev.filter((p) => p.id !== photoId);
    });
  };

  // Manually reassign a photo to a specific hike
  const handleReassignPhoto = (photoId: string, hikeId: string) => {
    setParsedPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p;
        if (!hikeId) {
          return {
            ...p,
            matchedHikeId: undefined,
            matchedHikeTitle: undefined,
            matchedConfidence: 'unmatched',
          };
        }
        const hike = hikes.find((h) => h.id === hikeId);
        return {
          ...p,
          matchedHikeId: hikeId,
          matchedHikeTitle: hike?.title || 'Túra',
          matchedConfidence: 'manual',
        };
      })
    );
  };

  // Group photos by matched hike
  const matchedGroups: PhotoMatchGroup[] = [];
  const unmatchedPhotos: ParsedPhotoInfo[] = [];

  parsedPhotos.forEach((photo) => {
    if (photo.matchedHikeId) {
      let group = matchedGroups.find((g) => g.hike.id === photo.matchedHikeId);
      if (!group) {
        const hike = hikes.find((h) => h.id === photo.matchedHikeId);
        if (hike) {
          group = { hike, photos: [] };
          matchedGroups.push(group);
        } else {
          unmatchedPhotos.push(photo);
          return;
        }
      }
      group.photos.push(photo);
    } else {
      unmatchedPhotos.push(photo);
    }
  });

  // Execute Save: compress photos and update each hike in Firestore
  const handleSaveAll = async () => {
    if (matchedGroups.length === 0) return;

    setIsSaving(true);
    let totalPhotosProcessed = 0;
    const totalToSave = matchedGroups.reduce((acc, g) => acc + g.photos.length, 0);
    setSavingProgress({ done: 0, total: totalToSave, currentHike: 'Zahajuji...' });

    try {
      for (const group of matchedGroups) {
        setSavingProgress({
          done: totalPhotosProcessed,
          total: totalToSave,
          currentHike: group.hike.title,
        });

        const newBase64Photos: string[] = [];
        for (const photoInfo of group.photos) {
          try {
            const base64 = await resizeImageFile(photoInfo.file);
            if (base64) {
              newBase64Photos.push(base64);
            }
          } catch (err) {
            console.warn('Chyba při kompresi fotky:', photoInfo.name, err);
          }
          totalPhotosProcessed++;
          setSavingProgress({
            done: totalPhotosProcessed,
            total: totalToSave,
            currentHike: group.hike.title,
          });
        }

        if (newBase64Photos.length > 0) {
          const currentPhotos = group.hike.photos || [];
          const combined = [...currentPhotos, ...newBase64Photos];
          // Cap at recommended max 25 photos
          const finalPhotos = combined.slice(0, 25);

          await onSaveHike({
            ...group.hike,
            photos: finalPhotos,
          });
        }
      }

      setSaveSuccess(`Úspěšně uloženo ${totalToSave} fotografií do ${matchedGroups.length} výprav!`);
      // Clear parsed list
      parsedPhotos.forEach((p) => {
        if (p.thumbnailUrl) URL.revokeObjectURL(p.thumbnailUrl);
      });
      setParsedPhotos([]);
    } catch (err: any) {
      alert(`Chyba při ukládání: ${err.message || 'Neznámá chyba'}`);
    } finally {
      setIsSaving(false);
      setSavingProgress(null);
    }
  };

  const totalMatchedPhotosCount = matchedGroups.reduce((acc, g) => acc + g.photos.length, 0);

  return (
    <div
      id="smart-photo-import-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/85 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 animate-fadeIn"
    >
      <div
        id="smart-photo-import-modal-content"
        className="relative w-full max-w-4xl bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-4 sm:my-8 text-stone-100 flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-stone-800 bg-stone-950/60 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-stone-100 flex items-center gap-2">
                  <span>Chytrý import fotek z mobilu</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    EXIF Auto-párování
                  </span>
                </h2>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Vyberte fotky z mobilu. Aplikace podle data a času pořízení fotky sama pozná, ke které túře patří.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-stone-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(88vh-140px)]">
          {/* Success Banner */}
          {saveSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/50 flex items-center gap-3 animate-fadeIn">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-emerald-200">{saveSuccess}</div>
                <div className="text-xs text-emerald-400/90 mt-0.5">
                  Fotografie byly uloženy do databáze a jsou okamžitě zobrazeny v Horském deníku.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors shrink-0"
              >
                Prohlédnout deník
              </button>
            </div>
          )}

          {/* Upload Dropzone / Mobile Picker */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`relative p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center group ${
              isAnalyzing
                ? 'border-amber-500/50 bg-amber-950/10'
                : 'border-stone-700/80 hover:border-amber-400 bg-stone-950/40 hover:bg-stone-950/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              disabled={isAnalyzing || isSaving}
              onChange={(e) => handleFilesSelected(e.target.files)}
            />

            {isAnalyzing ? (
              <div className="space-y-3 flex flex-col items-center">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <div className="text-sm font-semibold text-stone-200">
                  Čtu metadata z fotografií ({analyzingProgress?.done} / {analyzingProgress?.total})...
                </div>
                <div className="w-48 bg-stone-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-200"
                    style={{
                      width: analyzingProgress
                        ? `${(analyzingProgress.done / analyzingProgress.total) * 100}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-transform shadow-lg">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm sm:text-base font-semibold text-stone-100 mb-1">
                  Vyberte fotky z mobilu (i desítky najednou)
                </div>
                <p className="text-xs text-stone-400 max-w-md">
                  Klepněte sem pro výběr z galerie vašeho telefonu. Podporovány jsou JPG, PNG i HEIC formáty.
                </p>
                <div className="mt-4 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Vybrat fotografie</span>
                </div>
              </>
            )}
          </div>

          {/* Matched Groups Preview */}
          {matchedGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Automaticky spárované výpravy ({matchedGroups.length})</span>
                </h3>
                <span className="text-xs text-emerald-400 font-medium">
                  {totalMatchedPhotosCount} {totalMatchedPhotosCount === 1 ? 'fotka' : totalMatchedPhotosCount < 5 ? 'fotky' : 'fotek'} připraveno k uložení
                </span>
              </div>

              <div className="space-y-4">
                {matchedGroups.map((group) => {
                  const existingCount = group.hike.photos?.length || 0;
                  const newCount = group.photos.length;
                  const totalAfter = existingCount + newCount;

                  return (
                    <div
                      key={group.hike.id}
                      className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3 shadow-md"
                    >
                      {/* Hike Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-800/80">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-stone-100">
                              {group.hike.title}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 text-[11px] font-mono">
                              {formatDateDisplay(group.hike.date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                            <span className="text-emerald-400 font-medium">{group.hike.mountainRange}</span>
                            <span>•</span>
                            <span>
                              {group.hike.distanceKm} km {group.hike.duration ? `(${group.hike.duration})` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone-400">
                            Stav v deníku: {existingCount} fotek{' '}
                            <span className="text-emerald-400 font-semibold">+{newCount} nových</span> ={' '}
                            <strong className="text-stone-200">{totalAfter}/25</strong>
                          </span>
                        </div>
                      </div>

                      {/* Photo Thumbnails */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                        {group.photos.map((photo) => (
                          <div
                            key={photo.id}
                            className="relative rounded-xl overflow-hidden bg-stone-900 border border-stone-800 group shadow-sm flex flex-col"
                          >
                            <div className="relative h-24 w-full overflow-hidden bg-stone-950">
                              {photo.thumbnailUrl && (
                                <img
                                  src={photo.thumbnailUrl}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              )}

                              {/* Time badge */}
                              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-stone-950/85 backdrop-blur-xs text-stone-300 font-mono text-[9px] flex items-center gap-1 shadow">
                                <Clock className="w-2.5 h-2.5 text-amber-400" />
                                <span>{photo.timeString.slice(0, 5)}</span>
                              </div>

                              {/* Remove button */}
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(photo.id)}
                                className="absolute top-1 right-1 p-1 rounded-md bg-stone-950/85 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer shadow"
                                title="Odebrat fotografii"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* EXIF indicator & change dropdown */}
                            <div className="p-1.5 bg-stone-900/90 text-[10px] text-stone-400 flex items-center justify-between border-t border-stone-800">
                              <span className="truncate max-w-[80px]" title={photo.name}>
                                {photo.source === 'exif' ? '📷 EXIF čas' : '📁 Čas souboru'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unmatched Photos (if any photo date doesn't match any hike) */}
          {unmatchedPhotos.length > 0 && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs sm:text-sm">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Nepřiřazené fotografie ({unmatchedPhotos.length}) – v deníku nebyla nalezena túra se stejným datem
                </span>
              </div>
              <p className="text-xs text-stone-400">
                U těchto fotek můžete ručně vybrat, ke které túře je chcete přiřadit, nebo je vynechat.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {unmatchedPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 flex items-center gap-3"
                  >
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-stone-950 shrink-0">
                      {photo.thumbnailUrl && (
                        <img src={photo.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-[11px] font-mono text-stone-300">
                        {photo.dateString} {photo.timeString.slice(0, 5)}
                      </div>
                      <select
                        value={photo.matchedHikeId || ''}
                        onChange={(e) => handleReassignPhoto(photo.id, e.target.value)}
                        className="w-full text-[11px] px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                      >
                        <option value="">(Vyberte túru k přiřazení)</option>
                        {hikes.map((h) => (
                          <option key={h.id} value={h.id}>
                            {formatDateDisplay(h.date)}: {h.title} ({h.mountainRange})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="p-1 rounded text-stone-500 hover:text-rose-400 transition-colors"
                      title="Smazat z importu"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Action Bar */}
        <div className="p-4 sm:p-5 border-t border-stone-800 bg-stone-950/80 sticky bottom-0 z-20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-stone-400 text-center sm:text-left">
            {parsedPhotos.length > 0 ? (
              <span>
                Celkem načteno: <strong>{parsedPhotos.length} fotografií</strong> (k uložení:{' '}
                <strong className="text-emerald-400">{totalMatchedPhotosCount}</strong>)
              </span>
            ) : (
              <span>Nahrajte fotky klepnutím na pole výše</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Zavřít
            </button>

            <button
              type="button"
              disabled={totalMatchedPhotosCount === 0 || isSaving}
              onClick={handleSaveAll}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    Ukládám {savingProgress?.done}/{savingProgress?.total}...
                  </span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>
                    Uložit {totalMatchedPhotosCount} {totalMatchedPhotosCount === 1 ? 'fotku' : totalMatchedPhotosCount < 5 ? 'fotky' : 'fotek'} do deníku
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
