import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Download } from 'lucide-react';

interface PhotoLightboxProps {
  photos: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  hikeTitle?: string;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
  hikeTitle,
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length]);

  // Keyboard navigation: Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex];

  return (
    <div
      id="photo-lightbox-backdrop"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-6 animate-fadeIn select-none"
    >
      {/* Top Bar */}
      <div className="w-full max-w-6xl flex items-center justify-between text-stone-300 py-2 border-b border-stone-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2.5 py-1 rounded-full bg-stone-800/80 text-xs font-mono text-emerald-400 border border-stone-700">
            {currentIndex + 1} / {photos.length}
          </span>
          {hikeTitle && (
            <span className="text-xs sm:text-sm font-medium text-stone-200 truncate">
              {hikeTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={currentPhoto}
            target="_blank"
            rel="noopener noreferrer"
            download={`foto-${currentIndex + 1}.jpg`}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            title="Otevřít v plné velikosti"
          >
            <Maximize2 className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer"
            title="Zavřít (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Area with Navigation Buttons */}
      <div className="relative w-full max-w-6xl flex-1 flex items-center justify-center py-4 overflow-hidden">
        {photos.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-stone-900/80 hover:bg-emerald-600 text-stone-200 hover:text-white border border-stone-700/60 shadow-xl transition-all cursor-pointer"
            title="Předchozí fotka (šipka vlevo)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img
          src={currentPhoto}
          alt={`Fotka z túry ${currentIndex + 1}`}
          className="max-h-[80vh] max-w-full object-contain rounded-xl sm:rounded-2xl shadow-2xl transition-transform duration-200"
        />

        {photos.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-stone-900/80 hover:bg-emerald-600 text-stone-200 hover:text-white border border-stone-700/60 shadow-xl transition-all cursor-pointer"
            title="Další fotka (šipka vpravo)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {photos.length > 1 && (
        <div className="w-full max-w-4xl flex items-center justify-center gap-2 overflow-x-auto py-2 px-4 scrollbar-thin">
          {photos.map((photo, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                idx === currentIndex
                  ? 'border-emerald-400 scale-105 shadow-md shadow-emerald-950'
                  : 'border-stone-800 opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={photo}
                alt={`Miniatura ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
