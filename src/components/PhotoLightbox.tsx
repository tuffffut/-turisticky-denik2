import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import { HikePhotoItem } from '../types';

interface PhotoLightboxProps {
  photos: (string | HikePhotoItem)[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (index: number) => void;
  canEdit?: boolean;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
  onDelete,
  canEdit = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [realDimensions, setRealDimensions] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomLevel(1);
    setRealDimensions(null);
  }, [initialIndex, isOpen]);

  const currentItem = photos[currentIndex];

  const loadPhotoSrc = useCallback(async () => {
    if (!currentItem) return;
    if (typeof currentItem === 'string') {
      if (currentItem.startsWith('data:') || currentItem.startsWith('http')) {
        setResolvedSrc(currentItem);
      } else if (currentItem.startsWith('/api/photos/')) {
        setIsLoading(true);
        try {
          const res = await fetch(currentItem);
          if (res.ok) {
            const json = await res.json();
            setResolvedSrc(json.dataUrl || currentItem);
          } else {
            setResolvedSrc(currentItem);
          }
        } catch {
          setResolvedSrc(currentItem);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResolvedSrc(currentItem);
      }
    } else {
      if (currentItem.dataUrl) {
        setResolvedSrc(currentItem.dataUrl);
      } else if (currentItem.url) {
        setIsLoading(true);
        try {
          const res = await fetch(currentItem.url);
          if (res.ok) {
            const json = await res.json();
            setResolvedSrc(json.dataUrl || currentItem.url);
          } else {
            setResolvedSrc(currentItem.url);
          }
        } catch {
          setResolvedSrc(currentItem.url);
        } finally {
          setIsLoading(false);
        }
      }
    }
  }, [currentItem]);

  useEffect(() => {
    if (isOpen) {
      loadPhotoSrc();
    }
  }, [isOpen, currentIndex, loadPhotoSrc]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, photos.length]);

  if (!isOpen || photos.length === 0) return null;

  const handleNext = () => {
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  };

  const handlePrev = () => {
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleDownload = () => {
    if (!resolvedSrc) return;
    const a = document.createElement('a');
    a.href = resolvedSrc;
    const dimSuffix = realDimensions ? `-${realDimensions.width}x${realDimensions.height}` : '';
    const ext = resolvedSrc.startsWith('data:image/jpeg') ? 'jpg' : 'webp';
    a.download = `horsky-denik-foto-${currentIndex + 1}${dimSuffix}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleToggleZoom = () => {
    setZoomLevel((prev) => (prev === 1 ? 1.75 : prev === 1.75 ? 2.5 : 1));
  };

  const caption = typeof currentItem === 'object' ? currentItem.caption : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md select-none animate-fadeIn">
      {/* Top action bar */}
      <div className="p-3 sm:p-4 flex items-center justify-between z-50 bg-gradient-to-b from-black/90 via-black/70 to-transparent">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm font-semibold text-stone-200 bg-stone-900/90 px-3 py-1 rounded-full border border-stone-700">
            {currentIndex + 1} / {photos.length}
          </span>
          {realDimensions ? (
            <span
              className={`text-[11px] px-2.5 py-1 rounded-md border font-medium flex items-center gap-1.5 ${
                realDimensions.width === 800 && realDimensions.height === 369
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                  : realDimensions.width >= 3000
                  ? 'bg-emerald-950/90 text-emerald-400 border-emerald-800/60'
                  : 'bg-stone-900 text-stone-300 border-stone-700'
              }`}
            >
              <span>
                {realDimensions.width} × {realDimensions.height} px
              </span>
              <span className="opacity-75">
                {realDimensions.width === 800 && realDimensions.height === 369
                  ? '• Náhled z Garminu'
                  : realDimensions.width >= 3800
                  ? '• 4K Ultra HD'
                  : realDimensions.width >= 2560
                  ? '• 2K QHD'
                  : realDimensions.width >= 1920
                  ? '• Full HD'
                  : ''}
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/50 font-medium">
              Zjišťuji rozlišení...
            </span>
          )}
          {zoomLevel > 1 && (
            <span className="text-[11px] text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/40">
              Přiblíženo {Math.round(zoomLevel * 100)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {zoomLevel > 1 && (
            <button
              onClick={() => setZoomLevel(1)}
              className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-xl transition"
              title="Resetovat přiblížení"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          <button
            onClick={handleToggleZoom}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-xl transition flex items-center gap-1 text-xs"
            title="Přiblížit fotografii (nebo poklepejte na fotku)"
          >
            {zoomLevel > 1 ? (
              <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
            <span className="hidden md:inline">{zoomLevel > 1 ? 'Zmenšit' : 'Zvětšit'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-xl transition"
            title="Stáhnout fotografii v plném rozlišení"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {canEdit && onDelete && (
            <button
              onClick={() => onDelete(currentIndex)}
              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/80 rounded-xl transition"
              title="Smazat fotografii"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-xl transition ml-1"
            title="Zavřít prohlížeč (Esc)"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Main photo viewport */}
      <div
        className="flex-1 w-full h-full relative flex items-center justify-center overflow-auto p-2 sm:p-6 cursor-zoom-in"
        onClick={handleToggleZoom}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-stone-400">Načítám fotografii v plné kvalitě...</span>
          </div>
        ) : (
          <div
            className="relative flex items-center justify-center transition-transform duration-200"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
          >
            <img
              ref={imgRef}
              src={resolvedSrc}
              alt={`Fotografie ${currentIndex + 1}`}
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth && el.naturalHeight) {
                  setRealDimensions({ width: el.naturalWidth, height: el.naturalHeight });
                }
              }}
              className="w-auto h-auto max-h-[82vh] max-w-[96vw] md:max-w-[90vw] object-contain rounded-xl shadow-2xl transition-all select-none"
              draggable={false}
            />
          </div>
        )}

        {/* Prev / Next navigation arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2.5 sm:p-3.5 text-stone-300 hover:text-white bg-black/60 hover:bg-black/80 rounded-full border border-stone-700/80 transition shadow-2xl z-40"
              title="Předchozí fotografie (šipka doleva)"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2.5 sm:p-3.5 text-stone-300 hover:text-white bg-black/60 hover:bg-black/80 rounded-full border border-stone-700/80 transition shadow-2xl z-40"
              title="Další fotografie (šipka doprava)"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </>
        )}
      </div>

      {/* Bottom thumbnails strip & caption */}
      <div className="p-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent z-40 flex flex-col items-center gap-2">
        {caption && (
          <div className="max-w-xl text-center text-xs sm:text-sm text-stone-200 px-4 py-1.5 bg-stone-900/80 backdrop-blur rounded-xl border border-stone-700">
            {caption}
          </div>
        )}

        {photos.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1 px-2 custom-scrollbar">
            {photos.map((p, idx) => {
              const thumbSrc =
                typeof p === 'string'
                  ? p.startsWith('/api/photos/')
                    ? `${p}?raw=1`
                    : p
                  : p.rawUrl || p.url || p.dataUrl || '';
              const isActive = idx === currentIndex;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setZoomLevel(1);
                    setCurrentIndex(idx);
                  }}
                  className={`relative flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 transition ${
                    isActive
                      ? 'border-emerald-500 scale-105 shadow-md shadow-emerald-900/50'
                      : 'border-stone-700 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
