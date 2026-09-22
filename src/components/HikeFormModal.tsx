import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileCheck,
  Image as ImageIcon,
  Mountain,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Check,
  AlertCircle,
  Star,
  Video,
  Compass,
  CloudSun,
  Smile,
  ArrowRight,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { MountainHike, HikeDifficulty, GPXTrackPoint, HikeVideo, HikeAISummary } from '../types';
import { parseGPX, buildGPXXml } from '../utils/gpxParser';
import { generateHikeAITips } from '../utils/aiAssistant';
import { resizeImageFile, processMultipleImageFiles } from '../utils/imageUtils';
import { POPULAR_MOUNTAIN_RANGES } from '../utils/mountainRanges';

interface HikeFormModalProps {
  isOpen: boolean;
  hikeToEdit: MountainHike | null;
  initialGpxContent?: { filename?: string; content: string } | null;
  initialHikeData?: Partial<MountainHike> | null;
  onClose: () => void;
  onSave: (hike: MountainHike) => Promise<void> | void;
}

export const HikeFormModal: React.FC<HikeFormModalProps> = ({
  isOpen,
  hikeToEdit,
  initialGpxContent,
  initialHikeData,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [mountainRange, setMountainRange] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [distanceKm, setDistanceKm] = useState<string | number>('');
  const [elevationGainM, setElevationGainM] = useState<string | number>('');
  const [elevationLossM, setElevationLossM] = useState<string | number>('');
  const [duration, setDuration] = useState('');
  const [movingDuration, setMovingDuration] = useState('');
  const [difficulty, setDifficulty] = useState<HikeDifficulty | ''>('');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [highestPointM, setHighestPointM] = useState<string | number>('');
  const [weather, setWeather] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [videos, setVideos] = useState<HikeVideo[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiSummary, setAiSummary] = useState<HikeAISummary | undefined>(undefined);
  const [trackPoints, setTrackPoints] = useState<GPXTrackPoint[] | undefined>(undefined);
  const [gpxFileName, setGpxFileName] = useState<string | null>(null);
  const [gpxRawXml, setGpxRawXml] = useState<string | undefined>(undefined);
  const [peakLat, setPeakLat] = useState<number | ''>('');
  const [peakLng, setPeakLng] = useState<number | ''>('');
  const [peakName, setPeakName] = useState('');
  const [importedNotice, setImportedNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiTone, setAiTone] = useState<'concise' | 'witty' | 'adventurous'>('concise');
  const [aiPreview, setAiPreview] = useState<HikeAISummary | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (hikeToEdit) {
      setTitle(hikeToEdit.title);
      setMountainRange(hikeToEdit.mountainRange);
      setDate(hikeToEdit.date);
      setDistanceKm(hikeToEdit.distanceKm);
      setElevationGainM(hikeToEdit.elevationGainM);
      setElevationLossM(hikeToEdit.elevationLossM ?? hikeToEdit.elevationGainM);
      setDuration(hikeToEdit.duration);
      setMovingDuration(hikeToEdit.movingDuration || '');
      setDifficulty(hikeToEdit.difficulty || '');
      setRating(typeof hikeToEdit.rating === 'number' && hikeToEdit.rating > 0 ? hikeToEdit.rating : undefined);
      setDescription(hikeToEdit.description);
      setHighestPointM(hikeToEdit.highestPointM ?? '');
      setWeather(hikeToEdit.weather ?? '');
      setPhotos(hikeToEdit.photos || []);
      setVideos(hikeToEdit.videos || []);
      setAiSummary(hikeToEdit.aiSummary);
      setTrackPoints(hikeToEdit.trackPoints);
      setGpxRawXml(hikeToEdit.gpxRawXml);
      setPeakLat(hikeToEdit.peakCoords?.lat ?? '');
      setPeakLng(hikeToEdit.peakCoords?.lng ?? '');
      setPeakName(hikeToEdit.peakCoords?.name ?? '');
      setGpxFileName(hikeToEdit.trackPoints ? 'Trasa je uložena' : null);
      setImportedNotice(null);
    } else {
      // Reset defaults
      const defaultTitle = initialHikeData?.title || '';
      const defaultRange = initialHikeData?.mountainRange || '';
      setTitle(defaultTitle);
      setMountainRange(defaultRange);
      setDate(initialHikeData?.date || new Date().toISOString().split('T')[0]);
      setDistanceKm(initialHikeData?.distanceKm ?? '');
      setElevationGainM(initialHikeData?.elevationGainM ?? '');
      setElevationLossM(initialHikeData?.elevationLossM ?? '');
      setDuration(initialHikeData?.duration || '2h 00m');
      setMovingDuration(initialHikeData?.movingDuration || '');
      setDifficulty(initialHikeData?.difficulty || '');
      setRating(undefined);
      setDescription(initialHikeData?.description || '');
      setHighestPointM(initialHikeData?.highestPointM ?? '');
      setWeather(initialHikeData?.weather ?? '');
      setPhotos([]);
      setVideos([]);
      setAiSummary(undefined);
      setTrackPoints(undefined);
      setGpxRawXml(undefined);
      setGpxFileName(null);
      setPeakLat('');
      setPeakLng('');
      setPeakName('');
      
      if (initialHikeData?.title || initialHikeData?.distanceKm) {
        setImportedNotice('Parametry výpravy byly automaticky předvyplněny z Garminu / Telegramu. Zkontrolujte je a uložte.');
      } else {
        setImportedNotice(null);
      }

      // If initial GPX content was provided via URL/Telegram
      if (initialGpxContent?.content) {
        try {
          const result = parseGPX(initialGpxContent.content);
          setTrackPoints(result.trackPoints);
          setGpxRawXml(initialGpxContent.content);
          setGpxFileName(initialGpxContent.filename || 'GPX trasa z odkazu / Telegramu');
          setDistanceKm(result.distanceKm);
          setElevationGainM(result.elevationGainM);
          setElevationLossM(result.elevationLossM);
          if (result.duration) setDuration(result.duration);
          if (result.movingDuration) setMovingDuration(result.movingDuration);
          if (result.date) setDate(result.date);
          if (result.maxElevationM) setHighestPointM(result.maxElevationM);
          if (!defaultTitle && result.name) setTitle(result.name);
          else if (!defaultTitle && initialGpxContent.filename) {
            setTitle(initialGpxContent.filename.replace(/\.gpx$/i, ''));
          }
          if (result.detectedRange) setMountainRange(result.detectedRange);

          if (result.trackPoints.length > 0) {
            let highestPt = result.trackPoints[0];
            result.trackPoints.forEach((p) => {
              if ((p.ele ?? 0) > (highestPt.ele ?? 0)) {
                highestPt = p;
              }
            });
            setPeakLat(highestPt.lat);
            setPeakLng(highestPt.lng);
            setPeakName(result.name || 'Nejvyšší bod trasy');
          }
          setImportedNotice(`GPX trasa načtena: ${result.distanceKm} km, doba ${result.duration || 'aktivity'}, převýšení +${result.elevationGainM} m.`);
        } catch (err: any) {
          console.warn('Chyba při načítání GPX:', err);
        }
      }
    }
    setFormError(null);
  }, [hikeToEdit, initialGpxContent, initialHikeData, isOpen]);

  if (!isOpen) return null;

  // Handle GPX file parsing
  const handleGPXFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      try {
        const result = parseGPX(content);
        setTrackPoints(result.trackPoints);
        setGpxRawXml(content);
        setGpxFileName(file.name);

        // Populate metrics calculated from each point of GPX
        setDistanceKm(result.distanceKm);
        setElevationGainM(result.elevationGainM);
        setElevationLossM(result.elevationLossM);
        if (result.duration) setDuration(result.duration);
        if (result.movingDuration) setMovingDuration(result.movingDuration);
        if (result.date) setDate(result.date);
        if (result.maxElevationM) setHighestPointM(result.maxElevationM);
        if (!title && result.name) setTitle(result.name);

        // Derive mountain range automatically from GPX track coordinates
        if (result.detectedRange) {
          setMountainRange(result.detectedRange);
        }

        // Set peak coords to highest point
        if (result.trackPoints.length > 0) {
          let highestPt = result.trackPoints[0];
          result.trackPoints.forEach((p) => {
            if ((p.ele ?? 0) > (highestPt.ele ?? 0)) {
              highestPt = p;
            }
          });
          setPeakLat(highestPt.lat);
          setPeakLng(highestPt.lng);
        }

        setImportedNotice(`GPX úspěšně načteno: délka ${result.distanceKm} km, čas ${result.duration || 'zaznamenán'}, převýšení +${result.elevationGainM} m.`);
        setFormError(null);
      } catch (err: any) {
        setFormError(err.message || 'Chyba při čtení GPX souboru.');
      }
    };
    reader.readAsText(file);
  };

  // Handle local image file upload (converts and compresses to light base64 JPEG)
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPhotos(true);
    setPhotoUploadProgress({ done: 0, total: files.length });

    try {
      const compressedList = await processMultipleImageFiles(files, (done, total) => {
        setPhotoUploadProgress({ done, total });
      });

      if (compressedList.length > 0) {
        setPhotos((prev) => {
          const combined = [...prev, ...compressedList];
          if (combined.length > 25) {
            return combined.slice(0, 25);
          }
          return combined;
        });
      }
    } catch (err) {
      console.warn('Chyba při zpracování fotografií:', err);
    } finally {
      setIsProcessingPhotos(false);
      setPhotoUploadProgress(null);
      // Reset input value so user can upload the same or more files again immediately
      e.target.value = '';
    }
  };

  const handleAddPhotoUrl = () => {
    if (newPhotoUrl.trim()) {
      setPhotos((prev) => [...prev, newPhotoUrl.trim()]);
      setNewPhotoUrl('');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Add video URL handler
  const handleAddVideo = () => {
    if (!newVideoUrl.trim()) return;
    const url = newVideoUrl.trim();
    let platform: 'youtube' | 'vimeo' | 'mp4' = 'mp4';
    if (/youtube\.com|youtu\.be/i.test(url)) {
      platform = 'youtube';
    } else if (/vimeo\.com/i.test(url)) {
      platform = 'vimeo';
    }

    const videoItem: HikeVideo = {
      id: `vid-${Date.now()}`,
      url,
      title: newVideoTitle.trim() || undefined,
      platform,
    };

    setVideos((prev) => [...prev, videoItem]);
    setNewVideoUrl('');
    setNewVideoTitle('');
  };

  const handleRemoveVideo = (index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));
  };

  // Append quick note tag to description field
  const handleAddQuickNoteTag = (tag: string) => {
    setDescription((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;
      return `${trimmed}, ${tag}`;
    });
  };

  // Generate engaging narrative from user's raw notes using AI
  const handleGenerateAIText = async () => {
    setIsGeneratingAI(true);
    setAiError(null);
    try {
      const dist = parseNumberInput(distanceKm);
      const gain = parseNumberInput(elevationGainM);
      const result = await generateHikeAITips({
        mountainName: title.trim() || 'Aktivita',
        mountainRange: mountainRange.trim() || 'Česká republika',
        difficulty: (difficulty as HikeDifficulty) || undefined,
        distanceKm: dist > 0 ? dist : undefined,
        elevationGainM: gain > 0 ? gain : undefined,
        duration: duration.trim() || undefined,
        weather: weather.trim() || undefined,
        rawNotes: description.trim(),
        tone: aiTone,
        locationCoords:
          typeof peakLat === 'number' && typeof peakLng === 'number'
            ? { lat: peakLat, lng: peakLng }
            : undefined,
      });

      setAiPreview(result);
    } catch (err: any) {
      console.error('Chyba při generování AI textu:', err);
      setAiError(err?.message || 'Nepodařilo se vygenerovat text. Zkuste to prosím znovu.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Replace what the user typed with the AI-polished narrative
  const handleApplyAITextReplace = () => {
    if (!aiPreview?.story) return;
    setDescription(aiPreview.story);
    setAiSummary(aiPreview);
    setAiPreview(null);
  };

  // Append AI text to current notes
  const handleApplyAITextAppend = () => {
    if (!aiPreview?.story) return;
    setDescription((prev) => (prev.trim() ? `${prev.trim()}\n\n${aiPreview.story}` : aiPreview.story!));
    setAiSummary(aiPreview);
    setAiPreview(null);
  };

  const parseNumberInput = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).trim().replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setFormError('Zadejte název výpravy.');
      return;
    }
    if (!mountainRange.trim()) {
      setFormError('Zadejte pohoří.');
      return;
    }

    const dist = parseNumberInput(distanceKm);
    if (dist <= 0) {
      setFormError('Zadejte platnou délku trasy v km (např. 14.5).');
      return;
    }

    const gain = elevationGainM === '' ? 0 : parseNumberInput(elevationGainM);
    if (gain < 0) {
      setFormError('Zadejte platné převýšení (m).');
      return;
    }

    const loss = elevationLossM !== '' ? parseNumberInput(elevationLossM) : gain;
    const highest = highestPointM !== '' ? parseNumberInput(highestPointM) : undefined;

    // Location coordinates for map overview
    let finalPeakCoords: { lat: number; lng: number; name?: string };
    if (typeof peakLat === 'number' && typeof peakLng === 'number') {
      finalPeakCoords = {
        lat: peakLat,
        lng: peakLng,
        name: peakName.trim() || title.trim(),
      };
    } else if (trackPoints && trackPoints.length > 0) {
      finalPeakCoords = {
        lat: trackPoints[0].lat,
        lng: trackPoints[0].lng,
        name: title.trim(),
      };
    } else if (hikeToEdit?.peakCoords) {
      finalPeakCoords = hikeToEdit.peakCoords;
    } else {
      finalPeakCoords = {
        lat: 50.736,
        lng: 15.7396,
        name: title.trim(),
      };
    }

    const savedHike: MountainHike = {
      id: hikeToEdit?.id || `hike-${Date.now()}`,
      title: title.trim(),
      mountainRange: mountainRange.trim(),
      date,
      distanceKm: Math.round(dist * 100) / 100,
      elevationGainM: Math.round(gain),
      elevationLossM: Math.round(loss),
      duration: duration.trim() || '2h 00m',
      movingDuration: movingDuration.trim() || undefined,
      difficulty: (difficulty as HikeDifficulty) || undefined,
      rating: typeof rating === 'number' && rating > 0 ? rating : undefined,
      description: description.trim() || 'Záznam výpravy.',
      photos: photos,
      videos: videos.length > 0 ? videos : undefined,
      aiSummary,
      highestPointM: highest ? Math.round(highest) : undefined,
      weather: weather.trim() || undefined,
      peakCoords: finalPeakCoords,
      trackPoints,
      gpxRawXml: gpxRawXml || (trackPoints ? buildGPXXml(title, trackPoints) : undefined),
    };

    setIsSaving(true);
    setFormError(null);
    try {
      await onSave(savedHike);
      onClose();
    } catch (err: any) {
      console.error('Chyba při ukládání výpravy:', err);
      setFormError(err?.message || 'Nepodařilo se uložit změny.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="hike-form-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/85 backdrop-blur-md flex items-start justify-center p-2 sm:p-4 md:p-6 animate-fadeIn"
    >
      <div
        id="hike-form-modal-content"
        className="relative w-full max-w-3xl bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-4 sm:my-8 text-stone-100 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-stone-800 bg-stone-900/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Mountain className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-stone-100">
              {hikeToEdit ? 'Upravit horskou výpravu' : 'Nová horská výprava'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {importedNotice && (
          <div className="mx-5 sm:mx-6 mt-4 p-3 bg-emerald-950/70 border border-emerald-600/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importedNotice}</span>
          </div>
        )}

        {/* Form Body */}
        <form noValidate onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/50 border border-rose-900/60 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* GPX File Drag & Drop Box */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-dashed border-stone-700 hover:border-emerald-500/60 transition-colors">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-950/80 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-stone-200">
                    {gpxFileName ? 'Trasa GPX načtena' : 'Nahrát trasu z GPX souboru'}
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    {gpxFileName
                      ? `${gpxFileName} (${trackPoints?.length || 0} bodů trasy)`
                      : 'Automaticky dopočítá kilometry, nastoupané metry a vytvoří interaktivní mapu i profil.'}
                  </p>
                </div>
              </div>

              <label className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors shrink-0 shadow-sm">
                <span>{gpxFileName ? 'Změnit GPX' : 'Vybrat .gpx soubor'}</span>
                <input
                  type="file"
                  accept=".gpx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleGPXFileUpload(file);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Basic Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Název výpravy *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="např. Výstup na Sněžku přes Obří důl"
                className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Pohoří *
              </label>
              <input
                type="text"
                list="popular-mountain-ranges"
                value={mountainRange}
                onChange={(e) => setMountainRange(e.target.value)}
                placeholder="např. Brno a okolí, Moravský kras, Krkonoše, Jeseníky"
                className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-sm focus:outline-none focus:border-emerald-500"
              />
              <datalist id="popular-mountain-ranges">
                {POPULAR_MOUNTAIN_RANGES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Datum túry
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Délka (km) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="14.5"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Převýšení + (m) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={elevationGainM}
                onChange={(e) => setElevationGainM(e.target.value)}
                placeholder="950"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Sestup - (m)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={elevationLossM}
                onChange={(e) => setElevationLossM(e.target.value)}
                placeholder="950"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Celkový čas
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="5h 30m"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Aktivní čas (pohyb)
              </label>
              <input
                type="text"
                value={movingDuration}
                onChange={(e) => setMovingDuration(e.target.value)}
                placeholder="4h 15m"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Difficulty & Rating & Weather */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Obtížnost
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as HikeDifficulty | '')}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="">Nevyplněno / neurčeno</option>
                <option value="easy">Lehká (rodinná / pohodová trasa)</option>
                <option value="moderate">Střední (typická horská túra)</option>
                <option value="hard">Těžká (náročné převýšení / řetězy)</option>
                <option value="ferrata">🧗 Ferrata (zajištěná cesta s lanem)</option>
                <option value="climbing">🧗 Lezení / Horolezectví (mountaineering)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Hodnocení zážitku
              </label>
              <div className="flex items-center gap-1.5 py-1.5 px-3 bg-stone-950 border border-stone-800 rounded-xl">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(rating === star ? undefined : star)}
                    className="p-0.5 cursor-pointer text-amber-400 hover:scale-110 transition-transform"
                    title={`Nastavit ${star} z 5 (kliknutím zrušíte)`}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        rating && star <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-700'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs text-stone-400 ml-1.5">
                  {rating ? `${rating}/5` : 'Nehodnoceno'}
                </span>
                {rating && (
                  <button
                    type="button"
                    onClick={() => setRating(undefined)}
                    className="text-[10px] text-stone-500 hover:text-rose-400 ml-auto transition-colors cursor-pointer"
                    title="Zrušit hodnocení"
                  >
                    Zrušit
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Počasí
              </label>
              <input
                type="text"
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                placeholder="např. Slunečno, 18°C, suchá skála"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Quick weather chip presets */}
          <div className="flex items-center gap-1.5 flex-wrap -mt-2">
            <span className="text-[11px] text-stone-400">Rychlá volba počasí:</span>
            {['Slunečno, 20°C', 'Polojasno, svěží vítr', 'Mlha a chladno', 'Déšť a mokro', 'Sníh a mráz', 'Ideální ferratové'].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeather(w)}
                className="px-2 py-0.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] transition-colors cursor-pointer"
              >
                {w}
              </button>
            ))}
          </div>

          {/* Authentic diary notes and description */}
          <div className="p-4 sm:p-5 rounded-2xl bg-stone-900/80 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-semibold text-stone-200 flex items-center gap-2">
                <Smile className="w-4 h-4 text-emerald-400" />
                <span>Popis výpravy & osobní zážitky:</span>
              </label>
              <div className="flex items-center gap-3">
                {description.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDescription('')}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Smazat pouze to, co jsem napsal do poznámek"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Smazat mé poznámky</span>
                  </button>
                )}
                <span className="text-[11px] text-stone-500">
                  {description.length} znaků
                </span>
              </div>
            </div>

            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Zde napište své poznámky, postřehy, zastávky, zážitky nebo cokoliv z cesty... AI z nich pak může vytvořit čtivý příběh."
              className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-emerald-500 transition-colors"
            />

            {/* Quick helper note chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-stone-400">Rychlé postřehy:</span>
              {[
                'výborná káva a zákusek',
                'krásná architektura a památky',
                'spousta kilometrů v nohách',
                'orosené pivo v cíli',
                'neskutečný výhled za odměnu',
                'pohodová procházka',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAddQuickNoteTag(chip)}
                  className="px-2.5 py-1 rounded-full bg-stone-800 hover:bg-stone-750 text-stone-300 text-[11px] border border-stone-700/60 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>

            {/* AI Generator action bar */}
            <div className="pt-2 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  id="btn-generate-ai-text"
                  type="button"
                  disabled={isGeneratingAI}
                  onClick={handleGenerateAIText}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/40 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  title="Vygeneruje čtivý text z vašich zapsaných poznámek a parametrů trasy"
                >
                  {isGeneratingAI ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-200" />
                      <span>AI píše text podle vašich poznámek...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Napsat text podle poznámek (AI)</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1 text-[11px] text-stone-400">
                  <span>Styl:</span>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value as any)}
                    className="bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-stone-300 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="concise">Stručný a trefný</option>
                    <option value="witty">Vtipný s nadhledem</option>
                    <option value="adventurous">Dobrodružný</option>
                  </select>
                </div>
              </div>

              {aiSummary && !aiPreview && (
                <span className="text-[11px] text-emerald-400/90 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>K aktivitě je připojen AI souhrn</span>
                </span>
              )}
            </div>

            {aiError && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {/* AI Generated text preview modal / card */}
            {aiPreview && (
              <div className="p-4 rounded-xl bg-stone-950 border border-emerald-500/40 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>Doporučený text od AI z vašich poznámek:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiPreview(null)}
                    className="text-stone-500 hover:text-stone-300 text-xs p-1 cursor-pointer"
                    title="Zavřít návrh"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {aiPreview.oneLiner && (
                  <p className="text-xs font-medium text-amber-300/95 italic bg-amber-950/20 px-3 py-1.5 rounded-lg border border-amber-500/20">
                    „{aiPreview.oneLiner}“
                  </p>
                )}

                <p className="text-xs sm:text-sm text-stone-200 leading-relaxed whitespace-pre-line bg-stone-900/80 p-3 rounded-xl border border-stone-800">
                  {aiPreview.story}
                </p>

                {aiPreview.highlights && (
                  <div className="text-[11px] text-stone-400 flex items-start gap-1.5">
                    <span className="font-semibold text-stone-300">Zajímavosti:</span>
                    <span>{aiPreview.highlights}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApplyAITextReplace}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                    title="Nahradí vaše původní poznámky v popisu tímto upraveným textem"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Použít text (nahradí to, co jsem psal)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyAITextAppend}
                    className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Ponechá vaše poznámky a připojí k nim tento text"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Připojit k mým poznámkám</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAiPreview(null)}
                    className="px-2.5 py-1.5 rounded-lg text-stone-400 hover:text-stone-200 text-xs transition-colors cursor-pointer"
                  >
                    Zahodit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Photos Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="block text-xs font-semibold text-stone-300">
                Fotografie z výpravy ({photos.length} / 25)
              </label>
              <span className="text-[11px] text-stone-400">
                {photos.length >= 25 ? (
                  <span className="text-amber-400 font-medium">Dosaženo doporučeného limitu 25 fotografií</span>
                ) : (
                  <span>Lze nahrát až 25 fotek najednou (automatická webová optimalizace)</span>
                )}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={newPhotoUrl}
                onChange={(e) => setNewPhotoUrl(e.target.value)}
                placeholder="Vložit URL obrázku (např. z Unsplash či Google Photos)..."
                className="flex-1 px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddPhotoUrl}
                className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Přidat URL</span>
              </button>

              <label className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 ${
                isProcessingPhotos
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 pointer-events-none'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              }`}>
                {isProcessingPhotos ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Zpracovávám {photoUploadProgress ? `${photoUploadProgress.done}/${photoUploadProgress.total}` : '...'}
                    </span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Nahrát fotky (i více najednou)</span>
                  </>
                )}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  disabled={isProcessingPhotos}
                  className="hidden"
                  onChange={handleImageFileUpload}
                />
              </label>
            </div>

            {/* Photo preview list */}
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {photos.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative w-24 h-20 rounded-xl overflow-hidden bg-stone-950 border border-stone-800 group shadow-sm"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 p-1 rounded bg-stone-950/80 text-rose-400 hover:text-rose-200 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                      title="Smazat fotografii"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded text-[9px] bg-stone-950/80 text-stone-300 font-mono">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Videos Management (YouTube / Vimeo / MP4) */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3">
            <div className="flex items-center gap-2 text-stone-200 font-semibold text-xs sm:text-sm">
              <Video className="w-4 h-4 text-sky-400" />
              <span>Video záznamy z výpravy (YouTube / Vimeo / MP4)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="url"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... nebo .mp4"
                className="px-3 py-2 bg-stone-900 border border-stone-700 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-sky-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newVideoTitle}
                  onChange={(e) => setNewVideoTitle(e.target.value)}
                  placeholder="Název videa (např. Dronové záběry)"
                  className="flex-1 px-3 py-2 bg-stone-900 border border-stone-700 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleAddVideo}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Přidat</span>
                </button>
              </div>
            </div>

            {/* Video items list */}
            {videos.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {videos.map((vid, idx) => (
                  <div
                    key={vid.id || idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-sky-950 text-sky-400 border border-sky-800">
                        {vid.platform}
                      </span>
                      <span className="font-medium text-stone-200 truncate">
                        {vid.title || vid.url}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVideo(idx)}
                      className="p-1 text-stone-400 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ukládám...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{hikeToEdit ? 'Uložit změny' : 'Vytvořit výpravu'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
