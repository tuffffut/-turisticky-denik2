import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Mountain,
  Compass,
  Star,
  Download,
  Edit2,
  Trash2,
  CloudSun,
  MapPin,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  Backpack,
  SunMedium,
  Video,
  Maximize2,
  Loader2,
  Quote,
  Smile,
  Share2,
  Send,
  Copy,
  Check,
} from 'lucide-react';
import { MountainHike, UserRole, GPXTrackPoint, HikeAISummary } from '../types';
import { HikeMap } from './HikeMap';
import { ElevationProfile } from './ElevationProfile';
import { downloadGPXFile, buildGPXXml } from '../utils/gpxParser';
import { PhotoLightbox } from './PhotoLightbox';
import { VideoPlayer } from './VideoPlayer';
import { generateHikeAITips } from '../utils/aiAssistant';
import { getHikeShareUrl, getTelegramShareUrl } from '../utils/auth';

interface HikeDetailModalProps {
  hike: MountainHike | null;
  currentRole: UserRole;
  readerPin?: string;
  onClose: () => void;
  onEdit: (hike: MountainHike) => void;
  onDelete: (hikeId: string) => void;
  onUpdateHike?: (updatedHike: MountainHike) => void;
}

export const HikeDetailModal: React.FC<HikeDetailModalProps> = ({
  hike,
  currentRole,
  readerPin = '0000',
  onClose,
  onEdit,
  onDelete,
  onUpdateHike,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<GPXTrackPoint | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [localAiSummary, setLocalAiSummary] = useState<HikeAISummary | undefined>(
    hike?.aiSummary
  );

  useEffect(() => {
    setLocalAiSummary(hike?.aiSummary);
  }, [hike?.aiSummary, hike?.id]);

  if (!hike) return null;

  const isAdmin = currentRole === 'admin';
  const effectiveAiSummary = localAiSummary || hike.aiSummary;

  const handleDownloadGPX = () => {
    let xmlContent = hike.gpxRawXml;
    if (!xmlContent && hike.trackPoints && hike.trackPoints.length > 0) {
      xmlContent = buildGPXXml(hike.title, hike.trackPoints);
    }

    if (xmlContent) {
      const safeFilename = hike.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 30);
      downloadGPXFile(`${safeFilename}_trasa.gpx`, xmlContent);
    }
  };

  const handleRegenerateAI = async () => {
    setIsGeneratingAI(true);
    try {
      const locCoords = hike.peakCoords
        ? { lat: hike.peakCoords.lat, lng: hike.peakCoords.lng }
        : hike.trackPoints?.[0]
        ? { lat: hike.trackPoints[0].lat, lng: hike.trackPoints[0].lng }
        : undefined;

      const res = await generateHikeAITips({
        mountainName: hike.title,
        mountainRange: hike.mountainRange,
        difficulty: hike.difficulty,
        distanceKm: hike.distanceKm,
        elevationGainM: hike.elevationGainM,
        weather: hike.weather,
        rawNotes: hike.description,
        tone: 'concise',
        locationCoords: locCoords,
      });

      setLocalAiSummary(res);

      if (onUpdateHike) {
        onUpdateHike({
          ...hike,
          aiSummary: res,
        });
      }
    } catch (err) {
      console.error('Chyba při generování AI tipů v detailu:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleRewriteDescriptionWithAI = async () => {
    setIsGeneratingAI(true);
    try {
      const locCoords = hike.peakCoords
        ? { lat: hike.peakCoords.lat, lng: hike.peakCoords.lng }
        : hike.trackPoints?.[0]
        ? { lat: hike.trackPoints[0].lat, lng: hike.trackPoints[0].lng }
        : undefined;

      const res = await generateHikeAITips({
        mountainName: hike.title,
        mountainRange: hike.mountainRange,
        difficulty: hike.difficulty,
        distanceKm: hike.distanceKm,
        elevationGainM: hike.elevationGainM,
        weather: hike.weather,
        rawNotes: hike.description,
        tone: 'concise',
        locationCoords: locCoords,
      });

      setLocalAiSummary(res);

      if (onUpdateHike && res.story) {
        onUpdateHike({
          ...hike,
          description: res.story,
          aiSummary: res,
        });
      }
    } catch (err) {
      console.error('Chyba při přepisování zápisu:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const getDifficultyText = (diff: string) => {
    switch (diff) {
      case 'easy':
        return 'Lehká obtížnost';
      case 'moderate':
        return 'Střední obtížnost';
      case 'hard':
        return 'Těžká / Náročná';
      case 'ferrata':
        return '🧗 Zajištěná cesta (Via Ferrata)';
      default:
        return diff;
    }
  };

  return (
    <>
      <div
        id="hike-detail-modal-backdrop"
        className="fixed inset-0 z-40 overflow-y-auto bg-stone-950/85 backdrop-blur-md flex items-start justify-center p-2 sm:p-4 md:p-6 animate-fadeIn"
      >
        <div
          id="hike-detail-modal-content"
          className="relative w-full max-w-5xl bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-4 sm:my-8 text-stone-100 flex flex-col"
        >
          {/* Sticky Modal Header Bar */}
          <div className="sticky top-0 z-30 bg-stone-900/95 border-b border-stone-800 px-4 sm:px-6 py-3.5 flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Mountain className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-stone-100 truncate">
                  {hike.title}
                </h2>
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <span className="font-semibold text-emerald-400">{hike.mountainRange}</span>
                  <span>•</span>
                  <span>
                    {new Date(hike.date).toLocaleDateString('cs-CZ', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Share Hike on Telegram / via Link */}
              <div className="relative">
                <button
                  id="detail-share-hike-btn"
                  type="button"
                  onClick={() => setShowShareDropdown(!showShareDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors cursor-pointer"
                  title="Sdílet tuto túru na Telegram nebo odkazem"
                >
                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden sm:inline">Sdílet</span>
                </button>

                {showShareDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl z-30 space-y-2">
                    <div className="text-[11px] text-stone-400 font-medium pb-1 border-b border-stone-800">
                      Sdílet výpravu s nahranou GPX:
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const directUrl = getHikeShareUrl(readerPin, hike.id);
                        const text = `🏔️ Podívej se na mou horskou výpravu ${hike.title} (${hike.distanceKm} km, převýšení +${hike.elevationGainM} m):`;
                        window.open(getTelegramShareUrl(directUrl, text), '_blank');
                        setShowShareDropdown(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Odeslat na Telegram</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const directUrl = getHikeShareUrl(readerPin, hike.id);
                        navigator.clipboard.writeText(directUrl);
                        setCopiedShare(true);
                        setTimeout(() => {
                          setCopiedShare(false);
                          setShowShareDropdown(false);
                        }, 2000);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors cursor-pointer border border-stone-700"
                    >
                      {copiedShare ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedShare ? 'Odkaz zkopírován!' : 'Kopírovat přímý odkaz'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Download GPX */}
              <button
                id="detail-download-gpx-btn"
                type="button"
                onClick={handleDownloadGPX}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors cursor-pointer"
                title="Stáhnout GPX soubor s trasou"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Stáhnout GPX</span>
              </button>

              {/* Admin actions */}
              {isAdmin && (
                <>
                  <button
                    id="detail-edit-hike-btn"
                    type="button"
                    onClick={() => onEdit(hike)}
                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs border border-stone-700 transition-colors cursor-pointer"
                    title="Upravit túru"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    id="detail-delete-hike-btn"
                    type="button"
                    onClick={() => {
                      if (confirm(`Opravdu chcete smazat výpravu „${hike.title}“?`)) {
                        onDelete(hike.id);
                        onClose();
                      }
                    }}
                    className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/80 text-rose-300 border border-rose-900/50 text-xs transition-colors cursor-pointer"
                    title="Smazat túru"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Close modal */}
              <button
                id="detail-close-btn"
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div className="p-4 sm:p-6 sm:pb-8 space-y-6">
            {/* Key Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
              <div className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col">
                <span className="text-stone-500 text-[11px] uppercase tracking-wider">Vzdálenost</span>
                <span className="text-lg font-bold text-stone-100 font-mono mt-0.5">
                  {hike.distanceKm} km
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col">
                <span className="text-stone-500 text-[11px] uppercase tracking-wider">Nastoupáno</span>
                <span className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                  +{hike.elevationGainM} m
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col">
                <span className="text-stone-500 text-[11px] uppercase tracking-wider">Sestoupáno</span>
                <span className="text-lg font-bold text-cyan-400 font-mono mt-0.5">
                  -{hike.elevationLossM ?? hike.elevationGainM} m
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col">
                <span className="text-stone-500 text-[11px] uppercase tracking-wider">Doba chůze</span>
                <span className="text-lg font-bold text-stone-100 font-mono mt-0.5">
                  {hike.duration}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col">
                <span className="text-stone-500 text-[11px] uppercase tracking-wider">Nejvyšší bod</span>
                <span className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                  {hike.highestPointM ? `${hike.highestPointM} m` : 'N/A'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col">
                <span className="text-stone-500 text-[11px] uppercase tracking-wider">Hodnocení</span>
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= hike.rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-stone-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Weather & Waypoints bar */}
            {(hike.weather || (hike.hutsAndWaypoints && hike.hutsAndWaypoints.length > 0)) && (
              <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-stone-950/40 border border-stone-800/80 text-xs">
                {hike.weather && (
                  <div className="flex items-center gap-1.5 text-stone-300">
                    <CloudSun className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Počasí: <strong>{hike.weather}</strong>
                    </span>
                  </div>
                )}
                {hike.hutsAndWaypoints && hike.hutsAndWaypoints.length > 0 && (
                  <div className="flex items-center gap-1.5 text-stone-300 flex-wrap">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Zastávky:</span>
                    <div className="flex flex-wrap gap-1">
                      {hike.hutsAndWaypoints.map((w, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-stone-800 text-stone-300 text-[11px]"
                        >
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Map & Elevation Profile Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  <span>Interaktivní mapa trasy & Výškový profil</span>
                </h3>
                <span className="text-xs text-stone-400">
                  {getDifficultyText(hike.difficulty)}
                </span>
              </div>

              {/* Map */}
              <HikeMap hike={hike} hoveredPoint={hoveredPoint} heightClass="h-80 sm:h-96" />

              {/* Elevation Profile */}
              {hike.trackPoints && hike.trackPoints.length > 1 && (
                <ElevationProfile
                  trackPoints={hike.trackPoints}
                  onHoverPoint={setHoveredPoint}
                  height={170}
                />
              )}
            </div>

            {/* Description / Story narrative */}
            <div className="bg-stone-950/60 p-4 sm:p-5 rounded-2xl border border-stone-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                  <Smile className="w-4 h-4 text-amber-400" />
                  <span>Zápis z deníku a zážitky z túry</span>
                </h3>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleRewriteDescriptionWithAI}
                    disabled={isGeneratingAI}
                    className="px-3 py-1 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-600/40 text-amber-200 text-xs rounded-xl font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto shadow-sm"
                  >
                    {isGeneratingAI ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Přepisuji zápis...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>✨ Přepsat do stručného stylu (AI)</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {effectiveAiSummary?.oneLiner && (
                <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-600/30 text-amber-300 text-xs italic font-medium flex items-center gap-2">
                  <Quote className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>„{effectiveAiSummary.oneLiner}“</span>
                </div>
              )}

              <p className="text-stone-300 text-sm leading-relaxed whitespace-pre-line">
                {hike.description}
              </p>
            </div>

            {/* AI Mountain Guide & Safety Advice Box */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/30 via-stone-950/60 to-emerald-950/20 border border-amber-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-900/40 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-950 text-amber-400 flex items-center justify-center border border-amber-600/40">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-200">
                      AI Horský Průvodce (Gemini)
                    </h3>
                    <p className="text-[11px] text-stone-400">
                      Bezpečnostní doporučení a výstroj generované umělou inteligencí
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRegenerateAI}
                  disabled={isGeneratingAI}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-xl font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                >
                  {isGeneratingAI ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Analyzuji...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{effectiveAiSummary ? 'Přegenerovat AI analýzu' : 'Vygenerovat AI analýzu'}</span>
                    </>
                  )}
                </button>
              </div>

              {effectiveAiSummary ? (
                <div className="space-y-3.5 text-xs sm:text-sm">
                  {effectiveAiSummary.story && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-amber-400 font-bold mb-1">
                        Atmosféra výstupu
                      </h4>
                      <p className="text-stone-300 leading-relaxed">
                        {effectiveAiSummary.story}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {effectiveAiSummary.safety && (
                      <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/40 space-y-1">
                        <div className="flex items-center gap-1.5 text-rose-300 font-bold text-xs uppercase tracking-wider">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Bezpečnost a rizika</span>
                        </div>
                        <p className="text-stone-300 text-xs leading-relaxed">
                          {effectiveAiSummary.safety}
                        </p>
                      </div>
                    )}

                    {effectiveAiSummary.gear && effectiveAiSummary.gear.length > 0 && (
                      <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/40 space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-xs uppercase tracking-wider">
                          <Backpack className="w-3.5 h-3.5" />
                          <span>Doporučená výstroj</span>
                        </div>
                        <ul className="text-stone-300 text-xs list-disc list-inside space-y-0.5">
                          {effectiveAiSummary.gear.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {(effectiveAiSummary.highlights || effectiveAiSummary.bestSeason) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-400 pt-1">
                      {effectiveAiSummary.highlights && (
                        <div>
                          <strong className="text-stone-200">Zajímavosti na trase: </strong>
                          <span>{effectiveAiSummary.highlights}</span>
                        </div>
                      )}
                      {effectiveAiSummary.bestSeason && (
                        <div>
                          <strong className="text-stone-200">Vhodné období: </strong>
                          <span>{effectiveAiSummary.bestSeason}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-stone-400">
                  Zatím nebyl vygenerován AI zápis pro tuto výpravu. Klikněte na tlačítko výše pro analýzu trasy.
                </div>
              )}
            </div>

            {/* Videos Section */}
            {hike.videos && hike.videos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                  <Video className="w-4 h-4 text-sky-400" />
                  <span>Video záznamy ({hike.videos.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {hike.videos.map((vid) => (
                    <VideoPlayer key={vid.id} video={vid} />
                  ))}
                </div>
              </div>
            )}

            {/* Photos Gallery */}
            {hike.photos && hike.photos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                    <span>Fotogalerie z výpravy ({hike.photos.length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsLightboxOpen(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Zobrazit na celou obrazovku</span>
                  </button>
                </div>

                {/* Main Photo Preview (Click to open Lightbox) */}
                <div
                  className="relative w-full h-72 sm:h-96 rounded-2xl overflow-hidden bg-stone-950 border border-stone-800 group cursor-pointer"
                  onClick={() => setIsLightboxOpen(true)}
                >
                  <img
                    src={hike.photos[activePhotoIdx]}
                    alt={`${hike.title} foto ${activePhotoIdx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-102 transition-all duration-300"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-xl bg-stone-900/90 text-stone-200 text-xs font-semibold flex items-center gap-1.5 shadow-xl border border-stone-700">
                      <Maximize2 className="w-4 h-4 text-emerald-400" />
                      <span>Otevřít na celou obrazovku</span>
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-stone-900/80 backdrop-blur-md text-xs text-stone-200">
                    Fotografie {activePhotoIdx + 1} z {hike.photos.length}
                  </div>
                </div>

                {/* Thumbnails row */}
                {hike.photos.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {hike.photos.map((photo, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setActivePhotoIdx(index)}
                        className={`relative w-20 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                          activePhotoIdx === index
                            ? 'border-emerald-500 shadow-md scale-95'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox */}
      <PhotoLightbox
        photos={hike.photos || []}
        initialIndex={activePhotoIdx}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        hikeTitle={hike.title}
      />
    </>
  );
};
