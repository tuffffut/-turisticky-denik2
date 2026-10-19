import React, { useState, useRef, useEffect } from 'react';
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
  AlertTriangle,
  Download,
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

  const [feedbackDialog, setFeedbackDialog] = useState<{
    type: 'warning' | 'error' | 'success';
    title: string;
    message: string;
    details?: string;
    confirmLabel?: string;
    onConfirm?: () => void;
    cancelLabel?: string;
    onCancel?: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<File[] | null>(null);
  const [isReplacingActivePhoto, setIsReplacingActivePhoto] = useState(false);

  // Synchronize formData whenever selected route or modal state changes
  useEffect(() => {
    if (route) {
      setFormData(route);
      setActivePhotoIndex((prev) => {
        const photosLen = (route.photos || []).length;
        if (photosLen === 0) return 0;
        return prev < photosLen ? prev : 0;
      });
      setIsEditing(isNew);
    } else {
      setFormData({
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
      });
      setActivePhotoIndex(0);
      setIsEditing(isNew);
    }
  }, [route, isOpen, isNew]);

  const currentPhotos = Array.isArray(formData.photos)
    ? formData.photos
    : Array.isArray(route?.photos)
    ? route!.photos
    : [];

  // Intrinsic dimension resolver: immune to container CSS layout
  useEffect(() => {
    if (!isOpen) return;
    const currentPhoto = currentPhotos[activePhotoIndex] || currentPhotos[0];
    if (!currentPhoto) {
      setActivePhotoDimensions(null);
      return;
    }

    if (typeof currentPhoto === 'object' && currentPhoto?.width && currentPhoto?.height) {
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
    if (probe.complete && probe.naturalWidth) {
      setActivePhotoDimensions({ width: probe.naturalWidth, height: probe.naturalHeight });
    }
  }, [activePhotoIndex, currentPhotos, isOpen]);

  // Shared function to optimize and upload files
  // Shared function to optimize and upload files
  const processFilesUpload = async (files: FileList | File[]) => {
    setIsUploadingPhotos(true);
    const filesArray = Array.from(files);
    const total = filesArray.length;
    const uploadedPhotos: HikePhotoItem[] = [];

    try {
      const targetHikeId = formData.id || route?.id;
      for (let i = 0; i < total; i++) {
        const file = filesArray[i];
        setUploadStatus(`Optimalizuji a nahrávám fotografii ${i + 1} z ${total} (plné 4K Ultra HD)...`);
        const photoItem = await uploadPhotoToStorage(file, targetHikeId);
        uploadedPhotos.push(photoItem);
      }

      if (uploadedPhotos.length === 0) {
        setUploadStatus('');
        return;
      }

      const existingPhotos = formData.photos || route?.photos || [];
      let newPhotosList: (string | HikePhotoItem)[];
      let newActiveIndex = activePhotoIndex;

      if (isReplacingActivePhoto && existingPhotos.length > 0 && activePhotoIndex < existingPhotos.length) {
        const copy = [...existingPhotos];
        copy[activePhotoIndex] = uploadedPhotos[0];
        if (uploadedPhotos.length > 1) {
          copy.push(...uploadedPhotos.slice(1));
        }
        newPhotosList = copy;
      } else {
        newPhotosList = [...existingPhotos, ...uploadedPhotos];
        newActiveIndex = existingPhotos.length;
      }
      setIsReplacingActivePhoto(false);

      setFormData((prev) => ({
        ...prev,
        photos: newPhotosList,
      }));
      setActivePhotoIndex(newActiveIndex);

      // Always save changes immediately to persist photos so they are never lost
      if (targetHikeId) {
        setUploadStatus('Ukládám trvalý odkaz k výpravě do cloudové databáze...');
        await onSave({
          ...route,
          ...formData,
          id: targetHikeId,
          photos: newPhotosList,
        });
      }

      // Ensure view stays on the newly uploaded photo
      setActivePhotoIndex(newActiveIndex);
      setUploadStatus('');

      const firstUploaded = uploadedPhotos[0];
      const resText = firstUploaded?.width && firstUploaded?.height ? `${firstUploaded.width} × ${firstUploaded.height} px` : '';
      const sizeText = firstUploaded?.sizeKb ? (firstUploaded.sizeKb > 1024 ? `${(firstUploaded.sizeKb / 1024).toFixed(1)} MB` : `${firstUploaded.sizeKb} KB`) : '';
      const infoText = [resText, sizeText].filter(Boolean).join(', ');

      setFeedbackDialog({
        type: 'success',
        title: '✅ Fotografie úspěšně uložena',
        message: total === 1
          ? `Fotografie ${infoText ? `(${infoText})` : ''} byla úspěšně uložena do cloudové databáze v plné 4K Ultra HD kvalitě!`
          : `${total} fotografií bylo úspěšně uloženo do cloudové databáze v plné kvalitě!`,
        confirmLabel: 'Skvělé',
        onConfirm: () => setFeedbackDialog(null),
      });
    } catch (err: any) {
      console.error('Chyba při nahrávání fotky:', err);
      setFeedbackDialog({
        type: 'error',
        title: '❌ Chyba při ukládání fotografie',
        message: err.message || 'Neznámá chyba při komunikaci se serverem',
        details: 'Fotografie nebyla do databáze uložena. Zkontrolujte prosím připojení k internetu a zkuste to znovu.',
        confirmLabel: 'Zavřít',
        onConfirm: () => setFeedbackDialog(null),
      });
    } finally {
      setIsUploadingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // If user unlocked while files were pending, auto-upload immediately
  useEffect(() => {
    if (canEdit && pendingFilesRef.current && pendingFilesRef.current.length > 0) {
      const filesToProcess = pendingFilesRef.current;
      pendingFilesRef.current = null;
      processFilesUpload(filesToProcess);
    }
  }, [canEdit]);

  if (!isOpen) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    // Snapshot files immediately into array so mobile browser sandboxes don't invalidate them
    const filesArray = Array.from(rawFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!canEdit) {
      pendingFilesRef.current = filesArray;
      onRequestUnlock();
      setFeedbackDialog({
        type: 'warning',
        title: '🔒 Režim úprav je uzamčen',
        message: 'Pro uložení fotografie zadejte PIN 1234. Po zadání PINu se vybraná fotografie ihned automaticky nahraje v plné kvalitě.',
        confirmLabel: 'Zadat PIN (1234)',
        onConfirm: () => {
          setFeedbackDialog(null);
          onRequestUnlock();
        },
      });
      return;
    }

    await processFilesUpload(filesArray);
  };

  const handleDeletePhoto = async (index: number) => {
    if (!canEdit) {
      onRequestUnlock();
      setFeedbackDialog({
        type: 'warning',
        title: '🔒 Režim úprav je uzamčen',
        message: 'Pro mazání fotografií musíte nejprve odemknout režim úprav (zadat PIN 1234).',
        confirmLabel: 'Zadat PIN',
        onConfirm: () => {
          setFeedbackDialog(null);
          onRequestUnlock();
        },
      });
      return;
    }

    setFeedbackDialog({
      type: 'warning',
      title: '🗑️ Odebrání fotografie',
      message: 'Opravdu chcete tuto fotografii z výpravy trvale smazat?',
      confirmLabel: 'Ano, smazat',
      onConfirm: async () => {
        setFeedbackDialog(null);
        try {
          const updated = [...currentPhotos];
          const removed = updated.splice(index, 1)[0];
          const targetHikeId = formData.id || route?.id;

          const photoId = typeof removed === 'object' && removed?.id
            ? removed.id
            : typeof removed === 'string' && removed.startsWith('/api/photos/')
            ? removed.replace('/api/photos/', '').split('?')[0]
            : null;

          if (targetHikeId && photoId) {
            try {
              await fetch(`/api/routes/${encodeURIComponent(targetHikeId)}/photos/${encodeURIComponent(photoId)}`, {
                method: 'DELETE',
              });
            } catch (delErr) {
              console.warn('Chyba při přímém mazání fotky ze serveru:', delErr);
            }
          }

          setFormData((prev) => ({ ...prev, photos: updated }));
          if (targetHikeId) {
            await onSave({ ...route, ...formData, photos: updated });
          }

          setActivePhotoIndex((prev) => Math.max(0, Math.min(prev, updated.length - 1)));
          if (lightboxIndex >= updated.length) {
            setLightboxIndex(Math.max(0, updated.length - 1));
          }
          if (updated.length === 0) {
            setLightboxOpen(false);
          }
        } catch (err: any) {
          setFeedbackDialog({
            type: 'error',
            title: 'Chyba při mazání',
            message: err.message,
            confirmLabel: 'Zavřít',
            onConfirm: () => setFeedbackDialog(null),
          });
        }
      },
      cancelLabel: 'Zrušit',
      onCancel: () => setFeedbackDialog(null),
    });
  };

  const handleGpxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const points: { lat: number; lng: number; ele?: number; time?: string; distFromStartKm?: number }[] = [];
      let minEle = Infinity;
      let maxEle = -Infinity;
      let totalDist = 0;
      let totalAscent = 0;
      let totalDescent = 0;

      // 1. Try browser DOMParser for 100% compliant XML parsing
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const pointNodes = xmlDoc.querySelectorAll('trkpt, rtept, wpt');

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
      } catch (xmlErr) {
        console.warn('DOMParser selhal, zkouším regulární výraz:', xmlErr);
      }

      // 2. Fallback to universal regex if DOMParser didn't find points
      if (points.length === 0) {
        const ptRegex = /<(?:[a-zA-Z0-9_-]+:)?(?:trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?(?:trkpt|rtept|wpt)>)/gi;
        let match;
        while ((match = ptRegex.exec(text)) !== null) {
          const attrs = match[1] || '';
          const inner = match[2] || '';
          const latMatch = /\blat=["']([^"']+)["']/i.exec(attrs);
          const lonMatch = /\b(?:lon|lng)=["']([^"']+)["']/i.exec(attrs);
          if (!latMatch || !lonMatch) continue;
          const lat = parseFloat(latMatch[1]);
          const lng = parseFloat(lonMatch[1]);
          const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(inner);
          const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
          if (!isNaN(lat) && !isNaN(lng)) {
            if (points.length > 0) {
              const p1 = points[points.length - 1];
              const dLat = ((lat - p1.lat) * Math.PI) / 180;
              const dLon = ((lng - p1.lng) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos((p1.lat * Math.PI) / 180) *
                  Math.cos((lat * Math.PI) / 180) *
                  Math.sin(dLon / 2) ** 2;
              totalDist += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              if (p1.ele !== undefined && ele !== undefined) {
                const diff = ele - p1.ele;
                if (diff > 0.8) totalAscent += diff;
                else if (diff < -0.8) totalDescent += Math.abs(diff);
              }
            }
            if (ele !== undefined) {
              if (ele < minEle) minEle = ele;
              if (ele > maxEle) maxEle = ele;
            }
            points.push({ lat, lng, ele: ele !== undefined ? Math.round(ele) : undefined, distFromStartKm: Math.round(totalDist * 100) / 100 });
          }
        }
      }

      if (points.length === 0) {
        throw new Error('V souboru GPX nebyly nalezeny žádné body trasy (<trkpt>, <rtept> ani <wpt>).');
      }

      // Detect mountain range
      let detectedRange = formData.mountainRange || route?.mountainRange || 'Krkonoše';
      if (points.length > 0) {
        detectedRange = detectMountainRangeFromCoords(points[0].lat, points[0].lng);
      }

      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const finalDistKm = Math.round(totalDist * 10) / 10 || formData.distanceKm || route?.distanceKm || 0;
      const finalGain = Math.round(totalAscent) || formData.elevationGainM || route?.elevationGainM || 0;
      const finalLoss = Math.round(totalDescent) || formData.elevationLossM || route?.elevationLossM || 0;
      const finalHighest = maxEle !== -Infinity ? Math.round(maxEle) : (formData.highestPointM || route?.highestPointM || 0);

      const updatedFormData = {
        ...formData,
        title: formData.title || cleanTitle,
        mountainRange: detectedRange,
        distanceKm: finalDistKm,
        elevationGainM: finalGain,
        elevationLossM: finalLoss,
        highestPointM: finalHighest,
        trackpoints: points,
        trackPoints: points,
        startPoint: points[0],
        endPoint: points[points.length - 1],
      };

      setFormData(updatedFormData);

      // Auto-save immediately if updating existing hike so track is immediately permanent
      const targetId = formData.id || route?.id;
      if (targetId) {
        await onSave({
          ...route,
          ...updatedFormData,
          id: targetId,
        });
      }

      setFeedbackDialog({
        type: 'success',
        title: '✅ GPX trasa úspěšně nahrána',
        message: `Byla načtena kompletní GPS trasa (${points.length} bodů, ${finalDistKm} km, převýšení +${finalGain} m). Změny byly ihned uloženy.`,
        confirmLabel: 'Rozumím',
        onConfirm: () => setFeedbackDialog(null),
      });
    } catch (err: any) {
      console.error('Chyba při čtení GPX:', err);
      setFeedbackDialog({
        type: 'error',
        title: '❌ Chyba při zpracování GPX',
        message: err.message || 'Nepodařilo se načíst body z vybraného souboru GPX.',
        confirmLabel: 'Zavřít',
        onConfirm: () => setFeedbackDialog(null),
      });
    } finally {
      if (gpxInputRef.current) gpxInputRef.current.value = '';
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
      setFeedbackDialog({
        type: 'success',
        title: '✅ Výprava uložena',
        message: 'Veškeré změny a data byla úspěšně zapsána do cloudové databáze.',
        confirmLabel: 'OK',
        onConfirm: () => {
          setFeedbackDialog(null);
          if (isNew) onClose();
        },
      });
    } catch (err: any) {
      setFeedbackDialog({
        type: 'error',
        title: '❌ Chyba při ukládání',
        message: err.message || 'Nepodařilo se uložit data výpravy.',
        confirmLabel: 'Zavřít',
        onConfirm: () => setFeedbackDialog(null),
      });
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
    // Prioritize direct 4K dataUrl, then rawUrl, then static photos directory, then url
    return photo.dataUrl || photo.rawUrl || (photo.id ? `./photos/${photo.id}.jpg` : '') || photo.url || '';
  };

  const handleDownloadCurrentPhoto = () => {
    const currentPhoto = currentPhotos[activePhotoIndex] || currentPhotos[0];
    if (!currentPhoto) return;

    let downloadUrl = '';
    let fileName = 'foto.jpg';

    if (typeof currentPhoto === 'string') {
      if (currentPhoto.startsWith('/api/photos/')) {
        downloadUrl = `${currentPhoto}${currentPhoto.includes('?') ? '&' : '?'}download=1`;
      } else {
        downloadUrl = currentPhoto;
      }
    } else {
      fileName = currentPhoto.name || 'foto.jpg';
      if (currentPhoto.url && currentPhoto.url.startsWith('/api/photos/')) {
        downloadUrl = `${currentPhoto.url}${currentPhoto.url.includes('?') ? '&' : '?'}download=1`;
      } else if (currentPhoto.rawUrl) {
        downloadUrl = currentPhoto.rawUrl.includes('download=1')
          ? currentPhoto.rawUrl
          : `${currentPhoto.rawUrl}&download=1`;
      } else if (currentPhoto.dataUrl) {
        downloadUrl = currentPhoto.dataUrl;
      } else if (currentPhoto.url) {
        downloadUrl = currentPhoto.url;
      }
    }

    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <>
      {/* Hidden file input unconditionally present in DOM */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="hidden"
        onChange={handlePhotoUpload}
      />
      <input
        ref={gpxInputRef}
        type="file"
        accept=".gpx"
        className="hidden"
        onChange={handleGpxFile}
      />

      {/* In-app custom feedback modal */}
      {feedbackDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl text-lg ${
                  feedbackDialog.type === 'error'
                    ? 'bg-red-950/80 text-red-400 border border-red-800/60'
                    : feedbackDialog.type === 'warning'
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                    : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                }`}
              >
                {feedbackDialog.type === 'error' ? '❌' : feedbackDialog.type === 'warning' ? '⚠️' : '✅'}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white mb-1">{feedbackDialog.title}</h3>
                <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-wrap">{feedbackDialog.message}</p>
                {feedbackDialog.details && (
                  <p className="text-[11px] text-stone-400 mt-2 bg-stone-950/60 border border-stone-800/80 p-2.5 rounded-xl leading-relaxed">
                    {feedbackDialog.details}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800/80">
              {feedbackDialog.cancelLabel && feedbackDialog.onCancel && (
                <button
                  type="button"
                  onClick={feedbackDialog.onCancel}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 transition"
                >
                  {feedbackDialog.cancelLabel}
                </button>
              )}
              {feedbackDialog.confirmLabel && feedbackDialog.onConfirm && (
                <button
                  type="button"
                  onClick={feedbackDialog.onConfirm}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition shadow ${
                    feedbackDialog.type === 'error'
                      ? 'bg-red-600 hover:bg-red-500'
                      : feedbackDialog.type === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {feedbackDialog.confirmLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-4 md:p-6 overflow-y-auto overflow-x-hidden">
        <div className="bg-stone-900 border-0 sm:border sm:border-stone-800 rounded-none sm:rounded-3xl w-full max-w-full sm:max-w-5xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn my-auto">
          {/* Header */}
          <div className="px-3.5 sm:px-6 py-3 sm:py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/95 sticky top-0 z-10 gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-1">
              <div className="p-2 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-emerald-400 shrink-0">
                <Mountain className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                  {isNew ? 'Nová horská výprava' : route?.title || 'Detail výpravy'}
                </h2>
                <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5 truncate">
                  <span className="text-emerald-400 font-medium truncate">{route?.mountainRange}</span>
                  {route?.date && (
                    <span className="shrink-0">
                      • {new Date(route.date).toLocaleDateString('cs-CZ')}
                      {route.startTime ? ` • ${route.startTime}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                  className="p-2 text-stone-300 hover:text-white bg-stone-800/80 hover:bg-stone-800 rounded-xl transition flex items-center gap-1.5 text-xs font-medium"
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
                className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition ml-0.5"
                title="Zavřít"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-3.5 sm:p-6 overflow-y-auto overflow-x-hidden space-y-4 sm:space-y-6 flex-1 custom-scrollbar">
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

                {/* Elevation profile & partial GPX warning banner */}
                {(() => {
                  const pts = (Array.isArray(formData?.trackpoints) && formData!.trackpoints.length > 1)
                    ? formData!.trackpoints
                    : (Array.isArray(route?.trackpoints) && route!.trackpoints.length > 1)
                    ? route!.trackpoints
                    : (Array.isArray(route?.trackPoints) && route!.trackPoints.length > 1)
                    ? route!.trackPoints
                    : [];
                  const totalRecordedKm = route?.distanceKm || formData?.distanceKm || 0;
                  let ptsDistKm = 0;
                  if (pts.length > 1) {
                    for (let i = 0; i < pts.length - 1; i++) {
                      const p1 = pts[i];
                      const p2 = pts[i + 1];
                      const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
                      const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
                      const a =
                        Math.sin(dLat / 2) ** 2 +
                        Math.cos((p1.lat * Math.PI) / 180) *
                          Math.cos((p2.lat * Math.PI) / 180) *
                          Math.sin(dLon / 2) ** 2;
                      ptsDistKm += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    }
                  }
                  const isPartialTrack = totalRecordedKm > 3 && pts.length > 0 && ptsDistKm < totalRecordedKm * 0.72;

                  return (
                    <div className="space-y-3">
                      {isPartialTrack && (
                        <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-xs">
                              <span className="font-semibold block text-amber-300">
                                Upozornění: GPX trasa je zkrácená (zaznamenáno pouze {ptsDistKm.toFixed(1)} km z celkových {totalRecordedKm} km)
                              </span>
                              <span className="text-stone-400 block mt-0.5">
                                Původní synchronizace z Garminu uložila pouze prvních {pts.length} bodů. Můžete nahrát kompletní originální GPX soubor přímo sem.
                              </span>
                            </div>
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => gpxInputRef.current?.click()}
                              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold rounded-xl transition shadow flex items-center gap-1.5 shrink-0"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Nahrát celou GPX trasu
                            </button>
                          )}
                        </div>
                      )}

                      {pts.length > 1 && (
                        <div>
                          <ElevationProfile
                            trackpoints={pts}
                            highestPointM={formData.highestPointM || route?.highestPointM}
                            elevationGainM={formData.elevationGainM || route?.elevationGainM}
                            distanceKm={formData.distanceKm || route?.distanceKm}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

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

                      <button
                        type="button"
                        onClick={() => {
                          setIsReplacingActivePhoto(false);
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
                          className="group relative w-full h-80 sm:h-[480px] md:h-[560px] bg-black/90 rounded-2xl overflow-hidden border border-stone-800 flex items-center justify-center cursor-pointer shadow-xl transition hover:border-emerald-500/80"
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
                          <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-3 flex items-start justify-between gap-2 pointer-events-none">
                            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                              <div className="bg-black/85 backdrop-blur px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium text-stone-200 border border-stone-700/80 flex items-center gap-1.5 shadow shrink-0">
                                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                                <span>
                                  {activePhotoIndex + 1} / {currentPhotos.length}
                                </span>
                              </div>
                              <div
                                className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold border shadow-lg backdrop-blur flex items-center gap-1.5 ${
                                  activePhotoDimensions && Math.max(activePhotoDimensions.width, activePhotoDimensions.height) >= 1900
                                    ? 'bg-emerald-950/95 text-emerald-300 border-emerald-700'
                                    : 'bg-stone-900/95 text-stone-200 border-stone-700'
                                }`}
                              >
                                <span className="font-extrabold text-white">Rozlišení:</span>
                                {activePhotoDimensions ? (
                                  <>
                                    <span>
                                      {activePhotoDimensions.width} × {activePhotoDimensions.height} px
                                    </span>
                                    <span className="opacity-90">
                                      {activePhotoDimensions.width >= 3600 || activePhotoDimensions.height >= 2100
                                        ? '• 4K Ultra HD'
                                        : activePhotoDimensions.width >= 2400 || activePhotoDimensions.height >= 1400
                                        ? '• 2.5K QHD'
                                        : activePhotoDimensions.width >= 1900 || activePhotoDimensions.height >= 1000
                                        ? '• Full HD'
                                        : activePhotoDimensions.width >= 1200 || activePhotoDimensions.height >= 700
                                        ? '• HD'
                                        : '• Originál'}
                                    </span>
                                    {typeof currentPhotos[activePhotoIndex] === 'object' && (currentPhotos[activePhotoIndex] as any)?.sizeKb ? (
                                      <span className="text-emerald-400 font-semibold ml-1">
                                        • {(currentPhotos[activePhotoIndex] as any).sizeKb > 1024
                                          ? ((currentPhotos[activePhotoIndex] as any).sizeKb / 1024).toFixed(1) + ' MB'
                                          : (currentPhotos[activePhotoIndex] as any).sizeKb + ' KB'}
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-stone-400 animate-pulse">Zjišťuji pixely fotografie...</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
                              {canEdit && currentPhotos.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(activePhotoIndex);
                                  }}
                                  className="bg-red-950/90 hover:bg-red-900 border border-red-800/80 text-red-300 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition"
                                  title="Trvale smazat tuto fotografii z výpravy"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                  <span className="hidden sm:inline">Smazat fotku</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsReplacingActivePhoto(true);
                                  fileInputRef.current?.click();
                                }}
                                className="bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition border border-stone-700"
                                title="Nahradit tuto fotografii novým souborem z disku"
                              >
                                <Upload className="w-3.5 h-3.5 text-stone-300" />
                                <span className="hidden sm:inline">Nahradit fotku</span>
                                <span className="sm:hidden text-[11px]">Nahradit</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadCurrentPhoto();
                                }}
                                className="bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition border border-emerald-800/80"
                                title="Stáhnout původní fotografii v plném rozlišení (originál soubor)"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="hidden sm:inline">Stáhnout originál</span>
                                <span className="sm:hidden text-[11px]">Stáhnout</span>
                              </button>
                              <div className="bg-black/75 backdrop-blur px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-stone-200 border border-stone-700/80 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition shadow">
                                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="hidden sm:inline">Celá obrazovka</span>
                              </div>
                            </div>
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

                        {/* Photo Resolution & Action Inspector Bar */}
                        <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <Camera className="w-4 h-4 text-emerald-400" />
                                <span>Foto {activePhotoIndex + 1} z {currentPhotos.length}</span>
                              </span>
                              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                                <span className="text-stone-300 font-semibold mr-1">Rozlišení:</span>
                                {activePhotoDimensions ? (
                                  <>
                                    {activePhotoDimensions.width} × {activePhotoDimensions.height} px
                                    {activePhotoDimensions.width >= 3600 || activePhotoDimensions.height >= 2100
                                      ? ' • 4K Ultra HD'
                                      : activePhotoDimensions.width >= 2400 || activePhotoDimensions.height >= 1400
                                      ? ' • 2.5K QHD'
                                      : activePhotoDimensions.width >= 1900 || activePhotoDimensions.height >= 1000
                                      ? ' • Full HD'
                                      : activePhotoDimensions.width >= 1200 || activePhotoDimensions.height >= 700
                                      ? ' • HD'
                                      : ''}
                                  </>
                                ) : (
                                  <span className="text-stone-400 animate-pulse">Zjišťuji pixely...</span>
                                )}
                              </span>
                              {typeof currentPhotos[activePhotoIndex] === 'object' && (currentPhotos[activePhotoIndex] as any)?.sizeKb && (
                                <span className="text-xs text-stone-300 bg-stone-800 px-2.5 py-0.5 rounded-full border border-stone-700 font-semibold">
                                  💾 Velikost: {(currentPhotos[activePhotoIndex] as any).sizeKb > 1024
                                    ? ((currentPhotos[activePhotoIndex] as any).sizeKb / 1024).toFixed(1) + ' MB'
                                    : (currentPhotos[activePhotoIndex] as any).sizeKb + ' KB'}
                                </span>
                              )}
                              {activePhotoDimensions && (
                                <span className="text-xs text-stone-400">
                                  ({((activePhotoDimensions.width * activePhotoDimensions.height) / 1000000).toFixed(1)} MPx)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                              <span>Původní originál v plné kvalitě z centrálního serveru (žádná ztrátová komprese).</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadCurrentPhoto();
                              }}
                              className="flex-1 sm:flex-none px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow transition shadow-emerald-950/40"
                              title="Stáhnout původní nezmenšený soubor z centrálního serveru"
                            >
                              <Download className="w-4 h-4" />
                              <span>
                                Stáhnout originál
                                {typeof currentPhotos[activePhotoIndex] === 'object' && (currentPhotos[activePhotoIndex] as any)?.sizeKb
                                  ? ` (${(currentPhotos[activePhotoIndex] as any).sizeKb > 1024 ? ((currentPhotos[activePhotoIndex] as any).sizeKb / 1024).toFixed(1) + ' MB' : (currentPhotos[activePhotoIndex] as any).sizeKb + ' KB'})`
                                  : ''}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxIndex(activePhotoIndex);
                                setLightboxOpen(true);
                              }}
                              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-stone-700 transition"
                              title="Otevřít na celou obrazovku v maximálním rozlišení se 100% přiblížením"
                            >
                              <Maximize2 className="w-4 h-4 text-emerald-400" />
                              <span>Celá obrazovka</span>
                            </button>
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
                        {currentPhotos.map((photo, idx) => {
                          const w = typeof photo === 'object' ? photo?.width : undefined;
                          const h = typeof photo === 'object' ? photo?.height : undefined;
                          const sizeKb = typeof photo === 'object' ? photo?.sizeKb : undefined;
                          return (
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
                            {/* Prominent Resolution Badge in Grid */}
                            <div className="absolute top-2 left-2 bg-black/90 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-bold text-emerald-300 border border-emerald-700/80 shadow flex items-center gap-1.5 z-10">
                              <Camera className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{w && h ? `${w} × ${h} px` : 'Plná kvalita'}</span>
                              {sizeKb ? ` • ${sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB'}` : ''}
                            </div>
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
                          );
                        })}
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
              <form onSubmit={handleSubmit} className="space-y-4 max-w-full">
                {/* GPX Upload button for autofill */}
                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-3.5 sm:p-4 text-center max-w-full">
                  <input
                    ref={gpxInputRef}
                    type="file"
                    accept=".gpx"
                    onChange={handleGpxFile}
                    className="hidden"
                  />
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-emerald-400 block truncate">
                        Importovat trasu z GPX souboru
                      </span>
                      <span className="text-xs text-stone-400 block mt-0.5 leading-relaxed">
                        Automaticky dopočítá vzdálenost, převýšení, čas a rozpozná pohoří.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => gpxInputRef.current?.click()}
                      className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 shadow shrink-0"
                    >
                      <Upload className="w-4 h-4" />
                      Vybrat GPX
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-full">
                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Název výpravy *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-400 block mb-1">
                      Čas zahájení (např. 09:30)
                    </label>
                    <input
                      type="time"
                      value={formData.startTime || ''}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                      className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                    className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none transition"
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
                    className="w-full max-w-full box-border bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm focus:border-emerald-500 focus:outline-none resize-none transition"
                    placeholder="Popište počasí, zážitky na trase, výhledy z vrcholu..."
                  />
                </div>

                {/* Photos upload section */}
                <div className="bg-stone-950/50 border border-stone-800 rounded-2xl p-3.5 sm:p-4 space-y-3 max-w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <span className="text-xs sm:text-sm font-semibold text-white block">
                        Fotografie k výpravě ({currentPhotos.length})
                      </span>
                      <span className="text-[11px] text-emerald-400">
                        Ukládá se v originální / 4K Ultra HD kvalitě
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsReplacingActivePhoto(false);
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploadingPhotos}
                      className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 shadow"
                    >
                      <Plus className="w-4 h-4" />
                      {isUploadingPhotos ? 'Nahrávám...' : 'Přidat fotky'}
                    </button>
                  </div>

                  {uploadStatus && (
                    <div className="p-3 bg-emerald-950/50 border border-emerald-800/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-pulse">
                      <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                      <span className="truncate">{uploadStatus}</span>
                    </div>
                  )}

                  {currentPhotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1 max-w-full">
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
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-md opacity-80 hover:opacity-100 transition shadow"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form buttons */}
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-3 sticky bottom-0 bg-stone-900/95 py-3 border-t border-stone-800/80 mt-2 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      if (isNew) onClose();
                      else setIsEditing(false);
                    }}
                    className="w-full sm:flex-1 py-3 rounded-xl border border-stone-800 text-stone-300 hover:bg-stone-800 text-sm font-medium transition"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2"
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
