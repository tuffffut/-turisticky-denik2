import React, { useState } from 'react';
import { X, Share2, Copy, Check, Eye, ShieldCheck, Send } from 'lucide-react';
import { PinConfig, UserRole } from '../types';
import { getShareUrl } from '../utils/auth';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinConfig: PinConfig;
  currentRole: UserRole;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  pinConfig,
  currentRole,
}) => {
  const [copiedKey, setCopiedKey] = useState<'reader' | 'admin' | null>(null);

  if (!isOpen) return null;

  const isAdmin = currentRole === 'admin';

  const handleCopy = (pin: string, type: 'reader' | 'admin') => {
    const url = getShareUrl(pin);
    navigator.clipboard.writeText(url);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleOpenTelegramShare = (pin: string) => {
    const url = encodeURIComponent(getShareUrl(pin));
    const text = encodeURIComponent('Ahoj, posílám odkaz na můj Horský Deník s GPX trasami a fotkami:');
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
  };

  return (
    <div
      id="share-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
    >
      <div
        id="share-modal-content"
        className="relative w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden text-stone-100 p-5 sm:p-6"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-100">
                Sdílet odkaz na Horský Deník
              </h3>
              <p className="text-xs text-stone-400">Přímý přístup bez nutnosti vyťukávat PIN</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 py-4 text-xs sm:text-sm">
          {/* Reader link */}
          <div className="p-3.5 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-stone-200">
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>Odkaz pro čtenáře (rodina, kamarádi)</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                PIN: {pinConfig.readerPin}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Příjemce uvidí všechny trasy, mapy, převýšení a fotky. Nemůže však nic smazat ani upravit.
            </p>
            <div className="p-2 rounded-xl bg-stone-900 border border-stone-800 font-mono text-[11px] text-stone-300 break-all select-all">
              {getShareUrl(pinConfig.readerPin)}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopy(pinConfig.readerPin, 'reader')}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedKey === 'reader' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Zkopírováno do schránky!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopírovat odkaz</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleOpenTelegramShare(pinConfig.readerPin)}
                className="py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Sdílet na Telegram"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Telegram</span>
              </button>
            </div>
          </div>

          {/* Admin link */}
          {isAdmin && (
            <div className="p-3.5 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-stone-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Odkaz pro správce (Admin)</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono">
                  PIN: {pinConfig.adminPin}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Tento odkaz si uložte do svých záložek pro okamžitý přístup se všemi právy k úpravám.
              </p>
              <div className="p-2 rounded-xl bg-stone-900 border border-stone-800 font-mono text-[11px] text-stone-300 break-all select-all">
                {getShareUrl(pinConfig.adminPin)}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(pinConfig.adminPin, 'admin')}
                className="w-full py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedKey === 'admin' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Zkopírováno do schránky!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopírovat správcovský odkaz</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
