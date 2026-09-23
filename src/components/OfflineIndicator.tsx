import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <aside
      role="status"
      aria-label="Offline status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/95 text-amber-50 px-3.5 py-2 text-xs font-semibold shadow-xl shadow-amber-950/40 border border-amber-500/50 backdrop-blur-md animate-fade-in"
    >
      <WifiOff className="w-4 h-4 text-amber-200 animate-pulse" />
      <span>Offline režim — zobrazují se dříve načtená data a mapy</span>
    </aside>
  );
};
