import React from 'react';
import { Video, ExternalLink, Play } from 'lucide-react';
import { HikeVideo } from '../types';

interface VideoPlayerProps {
  video: HikeVideo;
}

export function parseVideoUrl(rawUrl: string): {
  type: 'youtube' | 'vimeo' | 'mp4' | 'unknown';
  embedUrl: string;
} {
  const url = rawUrl.trim();

  // YouTube matchers
  // Standard: https://www.youtube.com/watch?v=VIDEO_ID
  // Short: https://youtu.be/VIDEO_ID
  // Shorts: https://www.youtube.com/shorts/VIDEO_ID
  const ytMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`,
    };
  }

  // Vimeo matcher: https://vimeo.com/123456789
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      type: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Direct MP4 / WebM video file
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
    return {
      type: 'mp4',
      embedUrl: url,
    };
  }

  return {
    type: 'unknown',
    embedUrl: url,
  };
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video }) => {
  const { type, embedUrl } = parseVideoUrl(video.url);

  return (
    <div className="rounded-2xl overflow-hidden bg-stone-950 border border-stone-800 shadow-lg">
      {video.title && (
        <div className="px-4 py-2.5 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-stone-200 font-medium">
            <Video className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">{video.title}</span>
          </div>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-400 hover:text-stone-200 flex items-center gap-1 transition-colors"
          >
            <span>Otevřít</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="relative aspect-video w-full bg-black flex items-center justify-center">
        {type === 'youtube' || type === 'vimeo' ? (
          <iframe
            src={embedUrl}
            title={video.title || 'Video z horské túry'}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : type === 'mp4' ? (
          <video
            src={embedUrl}
            controls
            preload="metadata"
            className="w-full h-full object-contain"
          >
            Váš prohlížeč nepodporuje přehrávání tohoto formátu videa.
          </video>
        ) : (
          <div className="p-6 text-center text-stone-400 space-y-2">
            <Play className="w-8 h-8 mx-auto text-stone-600" />
            <p className="text-xs">Externí odkaz na video záznam:</p>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium transition-colors"
            >
              <span>Přehrát video</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
