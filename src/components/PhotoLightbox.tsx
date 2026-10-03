import React, { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
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
  const [zoomLevel, setZoomLevel] = useState(1);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomLevel(1);
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
    a.download = `horsky-denik-foto-${currentIndex + 1}.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const caption = typeof currentItem === 'object' ? currentItem.caption : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none animate-fadeIn">
      {/* Top action bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-50 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-stone-300 bg-stone-800/80 px-3 py-1 rounded-full border border-stone-700">
            {currentIndex + 1} / {photos.length}
          </span>
          <span className="text-xs text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-800/50 hidden sm:inline-block">
            Full HD kvalita
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomLevel((z) => (z < 2.5 ? z + 0.5 : 1))}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-lg transition"
            title="Přiblížit / Oddálit"
          >
            {zoomLevel > 1 ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-lg transition"
            title="Stáhnout fotografii"
          >
            <Download className="w-5 h-5" />
          </button>
          {canEdit && onDelete && (
            <button
              onClick={() => onDelete(currentIndex)}
              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/80 rounded-lg transition"
              title="Smazat fotografii"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-lg transition ml-2"
            title="Zavřít (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main photo view */}
      <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-stone-400">Načítám fotografii v plné kvalitě...</span>
          </div>
        ) : (
          <img
            src={resolvedSrc}
            alt={`Fotografie ${currentIndex + 1}`}
            className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-200 shadow-2xl"
            style={{ transform: `scale(${zoomLevel})` }}
          />
        )}
      </div>

      {/* Nav arrows */}
      {photos.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-3 text-stone-300 hover:text-white bg-stone-900/60 hover:bg-stone-800 rounded-full border border-stone-700/60 transition shadow-lg z-40"
            title="Předchozí (šipka vlevo)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-3 text-stone-300 hover:text-white bg-stone-900/60 hover:bg-stone-800 rounded-full border border-stone-700/60 transition shadow-lg z-40"
            title="Další (šipka vpravo)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Caption bar */}
      {caption && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-lg bg-stone-900/80 backdrop-blur border border-stone-700/80 px-4 py-2 rounded-xl text-center text-sm text-stone-200 z-40">
          {caption}
        </div>
      )}
    </div>
  );
};
