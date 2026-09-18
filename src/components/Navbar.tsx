import React from 'react';
import {
  Mountain,
  ShieldCheck,
  Eye,
  Lock,
  Plus,
  Map as MapIcon,
  LayoutGrid,
  Share2,
  Settings,
  ArrowRightLeft,
  Send,
} from 'lucide-react';
import { UserRole } from '../types';

interface NavbarProps {
  currentRole: UserRole;
  currentView: 'cards' | 'map';
  onViewChange: (view: 'cards' | 'map') => void;
  onLock: () => void;
  onOpenSwitchToAdmin: () => void;
  onOpenNewHike: () => void;
  onOpenShareModal: () => void;
  onOpenTelegramModal: () => void;
  onOpenSettings: () => void;
  hikeCount: number;
  isFirestoreConnected?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  currentView,
  onViewChange,
  onLock,
  onOpenSwitchToAdmin,
  onOpenNewHike,
  onOpenShareModal,
  onOpenTelegramModal,
  onOpenSettings,
  hikeCount,
  isFirestoreConnected = true,
}) => {
  const isAdmin = currentRole === 'admin';

  return (
    <header
      id="main-navbar"
      className="sticky top-0 z-30 w-full bg-stone-900/90 border-b border-stone-800/90 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand logo & title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shrink-0">
            <Mountain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-stone-100 text-base sm:text-lg">
                Horský Deník
              </span>
              <span className="hidden md:inline-flex px-2 py-0.5 text-[11px] font-medium bg-stone-800 text-stone-300 rounded-full border border-stone-700/60">
                {hikeCount} {hikeCount === 1 ? 'výprava' : hikeCount < 5 ? 'výpravy' : 'výprav'}
              </span>
              <span
                title={isFirestoreConnected ? 'Synchronizováno s Google Firebase Firestore' : 'Režim offline / lokální úložiště'}
                className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-950/40 text-amber-300 rounded-full border border-amber-600/30"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isFirestoreConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>Firebase DB</span>
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-stone-400 leading-none mt-0.5">
              Evidence horských výprav a GPX tras
            </p>
          </div>
        </div>

        {/* Center View Selector Tabs */}
        <div className="flex items-center bg-stone-950/80 p-1 rounded-xl border border-stone-800">
          <button
            id="nav-view-cards-btn"
            type="button"
            onClick={() => onViewChange('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              currentView === 'cards'
                ? 'bg-stone-800 text-stone-100 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Karty</span>
          </button>
          <button
            id="nav-view-map-btn"
            type="button"
            onClick={() => onViewChange('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              currentView === 'map'
                ? 'bg-stone-800 text-stone-100 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Velká mapa</span>
          </button>
        </div>

        {/* Right side actions & Role Indicator */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Role Badge */}
          {isAdmin ? (
            <div
              id="role-badge-admin"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 text-xs font-medium"
              title="Máte oprávnění správce (můžete přidávat, upravovat a mazat túry)"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Účet:</span>
              <span className="font-semibold">Admin</span>
            </div>
          ) : (
            <div
              id="role-badge-reader"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/70 text-cyan-400 border border-cyan-800/60 text-xs font-medium"
              title="Pouze ke čtení. Pro úpravy se přepněte na Admin."
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Účet:</span>
              <span className="font-semibold">Čtenář</span>
            </div>
          )}

          {/* Switch to Admin button for reader */}
          {!isAdmin && (
            <button
              id="switch-to-admin-btn"
              type="button"
              onClick={onOpenSwitchToAdmin}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-medium transition-colors cursor-pointer"
              title="Zadat Admin PIN a získat plný přístup"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Přepnout na Admin</span>
            </button>
          )}

          {/* Admin Add Hike button */}
          {isAdmin && (
            <button
              id="navbar-add-hike-btn"
              type="button"
              onClick={onOpenNewHike}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Přidat túru</span>
            </button>
          )}

          {/* Share links button */}
          <button
            id="navbar-share-btn"
            type="button"
            onClick={onOpenShareModal}
            className="p-2 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-stone-100 border border-stone-700/60 transition-colors cursor-pointer"
            title="Sdílet odkaz s PINem (pro rodinu či přátele)"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Telegram integration button */}
          <button
            id="navbar-telegram-btn"
            type="button"
            onClick={onOpenTelegramModal}
            className="p-2 rounded-lg bg-sky-950/60 hover:bg-sky-900/80 text-sky-400 hover:text-sky-200 border border-sky-800/60 transition-colors cursor-pointer"
            title="Telegram Integrace & Mobilní Asistent"
          >
            <Send className="w-4 h-4" />
          </button>

          {/* Settings button */}
          <button
            id="navbar-settings-btn"
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-stone-100 border border-stone-700/60 transition-colors cursor-pointer"
            title="Nastavení PINů a aplikace"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Lock / Log out button */}
          <button
            id="navbar-lock-btn"
            type="button"
            onClick={onLock}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-rose-900/50 text-xs font-medium transition-colors cursor-pointer"
            title="Okamžitě zamknout aplikaci"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Zamknout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
