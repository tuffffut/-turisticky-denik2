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
  Sparkles,
  Video,
  Loader2,
  ShieldAlert,
  Compass,
  CloudSun,
  Backpack,
  Smile,
  ArrowRight,
  RotateCw,
  Quote,
} from 'lucide-react';
import { MountainHike, HikeDifficulty, GPXTrackPoint, HikeVideo, HikeAISummary } from '../types';
import { parseGPX, buildGPXXml } from '../utils/gpxParser';
import { generateHikeAITips } from '../utils/aiAssistant';

interface HikeFormModalProps {
  isOpen: boolean;
  hikeToEdit: MountainHike | null;
  initialGpxContent?: { filename?: string; content: string } | null;
  initialHikeData?: Partial<MountainHike> | null;
  onClose: () => void;
  onSave: (hike: MountainHike) => void;
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
  const [distanceKm, setDistanceKm] = useState<number | ''>('');
  const [elevationGainM, setElevationGainM] = useState<number | ''>('');
  const [elevationLossM, setElevationLossM] = useState<number | ''>('');
  const [duration, setDuration] = useState('');
  const [difficulty, setDifficulty] = useState<HikeDifficulty>('moderate');
  const [rating, setRating] = useState(5);
  const [description, setDescription] = useState('');
  const [highestPointM, setHighestPointM] = useState<number | ''>('');
  const [weather, setWeather] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [videos, setVideos] = useState<HikeVideo[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [aiSummary, setAiSummary] = useState<HikeAISummary | undefined>(undefined);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiTone, setAiTone] = useState<'concise' | 'witty' | 'adventurous'>('concise');
  const [rewrittenPreview, setRewrittenPreview] = useState<{
    story: string;
    oneLiner?: string;
  } | null>(null);

  const [trackPoints, setTrackPoints] = useState<GPXTrackPoint[] | undefined>(undefined);
  const [gpxFileName, setGpxFileName] = useState<string | null>(null);
  const [gpxRawXml, setGpxRawXml] = useState<string | undefined>(undefined);
  const [peakLat, setPeakLat] = useState<number | ''>('');
  const [peakLng, setPeakLng] = useState<number | ''>('');
  const [peakName, setPeakName] = useState('');
  const [importedNotice, setImportedNotice] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (hikeToEdit) {
      setTitle(hikeToEdit.title);
      setMountainRange(hikeToEdit.mountainRange);
      setDate(hikeToEdit.date);
      setDistanceKm(hikeToEdit.distanceKm);
      setElevationGainM(hikeToEdit.elevationGainM);
      setElevationLossM(hikeToEdit.elevationLossM ?? hikeToEdit.elevationGainM);
      setDuration(hikeToEdit.duration);
      setDifficulty(hikeToEdit.difficulty);
      setRating(hikeToEdit.rating);
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
      setRewrittenPreview(null);
      setImportedNotice(null);
    } else {
      // Reset defaults
      const defaultTitle = initialHikeData?.title || '';
      const defaultRange = initialHikeData?.mountainRange || 'Krkonoše';
      setTitle(defaultTitle);
      setMountainRange(defaultRange);
      setDate(new Date().toISOString().split('T')[0]);
      setDistanceKm(initialHikeData?.distanceKm ?? '');
      setElevationGainM(initialHikeData?.elevationGainM ?? '');
      setElevationLossM(initialHikeData?.elevationLossM ?? '');
      setDuration(initialHikeData?.duration || '4h 30m');
      setDifficulty(initialHikeData?.difficulty || 'moderate');
      setRating(5);
      setDescription(initialHikeData?.description || '');
      setHighestPointM(initialHikeData?.highestPointM ?? '');
      setWeather(initialHikeData?.weather ?? '');
      setPhotos([
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
      ]);
      setVideos([]);
      setAiSummary(undefined);
      setAiTone('concise');
      setTrackPoints(undefined);
      setGpxRawXml(undefined);
      setGpxFileName(null);
      setPeakLat('');
      setPeakLng('');
      setPeakName('');
      setRewrittenPreview(null);
      setImportedNotice(null);

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
          setImportedNotice('GPX trasa byla úspěšně načtena z Telegramu / odkazu! Všechny parametry jsou předvyplněné.');
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

        setFormError(null);
      } catch (err: any) {
        setFormError(err.message || 'Chyba při čtení GPX souboru.');
      }
    };
    reader.readAsText(file);
  };

  // Handle local image file upload (converts to base64)
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setPhotos((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
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

  // Trigger Gemini AI generation: Rewrite rough notes into an engaging & witty story
  const handleRewriteNotesWithAI = async () => {
    setIsGeneratingAI(true);
    setFormError(null);

    try {
      const result = await generateHikeAITips({
        mountainName: title || 'Horská výprava',
        mountainRange: mountainRange || 'Hory',
        difficulty,
        distanceKm: typeof distanceKm === 'number' ? distanceKm : undefined,
        elevationGainM: typeof elevationGainM === 'number' ? elevationGainM : undefined,
        weather,
        rawNotes: description,
        tone: aiTone,
      });

      setAiSummary(result);

      if (result.story) {
        setRewrittenPreview({
          story: result.story,
          oneLiner: result.oneLiner,
        });
      }
    } catch (err: any) {
      setFormError(err.message || 'Chyba při přepisování poznámek pomocí AI.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Apply rewritten story directly to description field
  const handleApplyRewrittenStory = () => {
    if (rewrittenPreview?.story) {
      setDescription(rewrittenPreview.story);
      setRewrittenPreview(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setFormError('Zadejte název výpravy.');
      return;
    }
    if (!mountainRange.trim()) {
      setFormError('Zadejte pohoří.');
      return;
    }
    if (!distanceKm || Number(distanceKm) <= 0) {
      setFormError('Zadejte platnou délku trasy v km.');
      return;
    }
    if (!elevationGainM || Number(elevationGainM) < 0) {
      setFormError('Zadejte nastoupané metry.');
      return;
    }

    // Default peak coordinate if empty
    const finalLat =
      typeof peakLat === 'number'
        ? peakLat
        : trackPoints?.[0]?.lat ?? 50.736;
    const finalLng =
      typeof peakLng === 'number'
        ? peakLng
        : trackPoints?.[0]?.lng ?? 15.7396;

    const savedHike: MountainHike = {
      id: hikeToEdit?.id || `hike-${Date.now()}`,
      title: title.trim(),
      mountainRange: mountainRange.trim(),
      date,
      distanceKm: Number(distanceKm),
      elevationGainM: Number(elevationGainM),
      elevationLossM: elevationLossM !== '' ? Number(elevationLossM) : Number(elevationGainM),
      duration: duration.trim() || '4h 00m',
      difficulty,
      rating,
      description: description.trim() || 'Krásná túra v horách.',
      photos: photos.length > 0 ? photos : ['https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80'],
      videos: videos.length > 0 ? videos : undefined,
      aiSummary,
      highestPointM: highestPointM !== '' ? Number(highestPointM) : undefined,
      weather: weather.trim() || undefined,
      peakCoords: {
        lat: finalLat,
        lng: finalLng,
        name: peakName.trim() || title.trim(),
      },
      trackPoints,
      gpxRawXml: gpxRawXml || (trackPoints ? buildGPXXml(title, trackPoints) : undefined),
    };

    onSave(savedHike);
    onClose();
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
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
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
                required
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
                required
                value={mountainRange}
                onChange={(e) => setMountainRange(e.target.value)}
                placeholder="např. Krkonoše, Vysoké Tatry, Malá Fatra, Jeseníky"
                className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                type="number"
                step="0.1"
                required
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="14.5"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Převýšení + (m) *
              </label>
              <input
                type="number"
                required
                value={elevationGainM}
                onChange={(e) => setElevationGainM(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="950"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                Čas chůze
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="5h 30m"
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500"
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
                onChange={(e) => setDifficulty(e.target.value as HikeDifficulty)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="easy">Lehká (rodinná / pohodová trasa)</option>
                <option value="moderate">Střední (typická horská túra)</option>
                <option value="hard">Těžká (náročné převýšení / řetězy)</option>
                <option value="ferrata">🧗 Ferrata (zajištěná cesta s lanem)</option>
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
                    onClick={() => setRating(star)}
                    className="p-0.5 cursor-pointer text-amber-400 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        star <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-700'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs text-stone-400 ml-2">{rating}/5</span>
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

          {/* Core Feature: AI Note Rewriter into Witty / Readable Story */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-950/40 via-stone-950/80 to-emerald-950/30 border border-amber-500/35 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-950 text-amber-400 flex items-center justify-center border border-amber-600/40 shadow-sm shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-amber-200">
                    AI Přepis poznámek do čtivého & vtipného textu
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    Napište níže pár surových poznámek či hesel a AI je přetvoří v zábavný deníkový zápis.
                  </p>
                </div>
              </div>

              {/* Tone switcher */}
              <div className="flex items-center bg-stone-900 border border-amber-900/50 rounded-xl p-1 text-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setAiTone('concise')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    aiTone === 'concise'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Stručný popisek (výchozí)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiTone('witty')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    aiTone === 'witty'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>Vtipný</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiTone('adventurous')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    aiTone === 'adventurous'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Dobrodružný
                </button>
              </div>
            </div>

            {/* Description textarea: user notes or final text */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-stone-300">
                  Poznámky z trasy & Popis zážitků:
                </label>
                <span className="text-[11px] text-stone-500">
                  {description.length} znaků
                </span>
              </div>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sem napište své surové poznámky (např.: strmý krpál, bolely nohy, ztratil jsem se v lese, pivo na chatě studený a výborný, nahoře mlha nic jsme neviděli ale paráda...)"
                className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Quick helper note chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-stone-400">Rychlé nápady k připsání:</span>
              {[
                'bolavé nohy a stehna v ohni',
                'orosené pivo na chatě',
                'nahoře mlha a vítr',
                'obří borůvkový knedlík',
                'ztratili jsme na chvíli značku',
                'neskutečný výhled za odměnu',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAddQuickNoteTag(chip)}
                  className="px-2 py-0.5 rounded-full bg-stone-850 hover:bg-stone-800 text-stone-300 text-[11px] border border-stone-700/60 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5 text-amber-400" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>

            {/* Action button to trigger rewrite */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-stone-400">
                AI model vezme vaše poznámky a sepíše je do přirozeného, čtivého a trochu vtipného textu.
              </p>

              <button
                type="button"
                onClick={handleRewriteNotesWithAI}
                disabled={isGeneratingAI}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:from-amber-400 hover:to-emerald-400 text-stone-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isGeneratingAI ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI přepisuje vaše zážitky...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>✨ Přepsat poznámky do vtipného textu</span>
                  </>
                )}
              </button>
            </div>

            {/* AI Rewritten Preview Result Box */}
            {rewrittenPreview && (
              <div className="mt-3 p-4 rounded-xl bg-stone-900/95 border border-amber-500/50 shadow-xl space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
                    <Quote className="w-4 h-4 text-amber-400" />
                    <span>Návrh přepsaného textu od AI ({aiTone === 'witty' ? 'vtipný styl' : aiTone}):</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRewriteNotesWithAI}
                    disabled={isGeneratingAI}
                    className="text-[11px] text-stone-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Zkusit znovu</span>
                  </button>
                </div>

                {rewrittenPreview.oneLiner && (
                  <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-200 text-xs italic font-medium">
                    „{rewrittenPreview.oneLiner}“
                  </div>
                )}

                <p className="text-stone-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line bg-stone-950/50 p-3 rounded-lg border border-stone-800">
                  {rewrittenPreview.story}
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRewrittenPreview(null)}
                    className="px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
                  >
                    Zavřít náhled
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyRewrittenStory}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Použít tento text jako popis výpravy</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Photos Management */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-stone-300">
              Fotografie z túry
            </label>

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

              <label className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shrink-0">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nahrát z disku</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
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
                    className="relative w-24 h-20 rounded-xl overflow-hidden bg-stone-950 border border-stone-800 group"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 p-1 rounded bg-stone-950/80 text-rose-400 hover:text-rose-200 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{hikeToEdit ? 'Uložit změny' : 'Vytvořit výpravu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
