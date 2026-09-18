import React, { useState } from 'react';
import {
  X,
  Settings,
  KeyRound,
  ShieldCheck,
  Eye,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  Share2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { PinConfig, UserRole } from '../types';
import { savePins, resetPinsToDefault, getShareUrl } from '../utils/auth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinConfig: PinConfig;
  currentRole: UserRole;
  onPinsUpdated: (newConfig: PinConfig) => void;
  onResetData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  pinConfig,
  currentRole,
  onPinsUpdated,
  onResetData,
}) => {
  const [adminPin, setAdminPin] = useState(pinConfig.adminPin);
  const [readerPin, setReaderPin] = useState(pinConfig.readerPin);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<'admin' | 'reader' | null>(null);

  if (!isOpen) return null;

  const isAdmin = currentRole === 'admin';

  const handleSavePins = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMessage('Pouze správce (Admin) může měnit PINy.');
      return;
    }

    if (adminPin.trim().length < 3 || readerPin.trim().length < 3) {
      setErrorMessage('Každý PIN musí mít alespoň 3 znaky/číslice.');
      return;
    }

    if (adminPin.trim() === readerPin.trim()) {
      setErrorMessage('Admin PIN a Čtenářský PIN musí být odlišné.');
      return;
    }

    const success = savePins(adminPin, readerPin);
    if (success) {
      onPinsUpdated({ adminPin: adminPin.trim(), readerPin: readerPin.trim() });
      setSaveMessage('PINy byly úspěšně uloženy do paměti prohlížeče.');
      setErrorMessage(null);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleResetPins = () => {
    if (confirm('Opravdu chcete obnovit výchozí PINy (Admin: 1234, Čtenář: 0000)?')) {
      const def = resetPinsToDefault();
      setAdminPin(def.adminPin);
      setReaderPin(def.readerPin);
      onPinsUpdated(def);
      setSaveMessage('PINy byly resetovány na výchozí hodnoty.');
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const copyToClipboard = (pin: string, type: 'admin' | 'reader') => {
    const url = getShareUrl(pin);
    navigator.clipboard.writeText(url);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/85 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 animate-fadeIn"
    >
      <div
        id="settings-modal-content"
        className="relative w-full max-w-xl bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-6 text-stone-100 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-800 text-stone-300 flex items-center justify-center border border-stone-700">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-stone-100">
              Nastavení a zabezpečení PINem
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

        <div className="p-5 sm:p-6 space-y-6 text-xs sm:text-sm">
          {/* Notification Messages */}
          {saveMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/60 border border-emerald-900/60 text-emerald-300 text-xs">
              <Check className="w-4 h-4 shrink-0" />
              <span>{saveMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-900/60 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Share Links Generation Box (Always useful for Telegram/Family) */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3">
            <div className="flex items-center gap-2 text-stone-200 font-semibold">
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>Odkazy pro přímé odemčení (Telegram, rodina, přátelé)</span>
            </div>
            <p className="text-stone-400 text-xs leading-relaxed">
              Tyto odkazy obsahují parametr <code className="text-stone-300 font-mono">?key=...</code>,
              díky kterému se příjemci deník okamžitě otevře bez nutnosti zadávat PIN na klávesnici:
            </p>

            <div className="space-y-2 pt-1">
              {/* Reader Share link */}
              <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-200 text-xs">
                      Odkaz pro čtenáře (pouze prohlížení)
                    </div>
                    <div className="text-[11px] text-stone-400 font-mono truncate">
                      {getShareUrl(pinConfig.readerPin)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(pinConfig.readerPin, 'reader')}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLink === 'reader' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Zkopírováno!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopírovat</span>
                    </>
                  )}
                </button>
              </div>

              {/* Admin Share link */}
              {isAdmin && (
                <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-200 text-xs">
                        Odkaz pro správce (Admin plný přístup)
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono truncate">
                        {getShareUrl(pinConfig.adminPin)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pinConfig.adminPin, 'admin')}
                    className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedLink === 'admin' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Zkopírováno!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopírovat</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Change PINs Form (Admin only) */}
          {isAdmin ? (
            <form onSubmit={handleSavePins} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-stone-200 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Změna přístupových PINů</span>
                </h3>
                <button
                  type="button"
                  onClick={handleResetPins}
                  className="text-xs text-stone-400 hover:text-stone-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Obnovit výchozí (1234 & 0000)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-stone-950/60 border border-stone-800">
                  <label className="block text-xs font-medium text-stone-300 mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Admin PIN (Správa)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 font-mono text-center text-lg tracking-widest focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-stone-500 mt-1.5">
                    Plný přístup k vytváření, úpravám a mazání tras.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-950/60 border border-stone-800">
                  <label className="block text-xs font-medium text-stone-300 mb-1 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Čtenářský PIN (Pouze čtení)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={readerPin}
                    onChange={(e) => setReaderPin(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 font-mono text-center text-lg tracking-widest focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-stone-500 mt-1.5">
                    Prohlížení tras, map a fotek bez editačních tlačítek.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Uložit nové PINy
                </button>
              </div>
            </form>
          ) : (
            <div className="p-3.5 rounded-xl bg-stone-950/60 border border-stone-800 text-stone-400 text-xs">
              <div className="flex items-center gap-1.5 text-stone-300 font-medium mb-1">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>Jste přihlášeni jako Čtenář</span>
              </div>
              Pro změnu PINů přepněte svůj účet na Správce (Admin) zadáním Admin PINu v horní liště.
            </div>
          )}

          {/* Data Reset Section */}
          {isAdmin && (
            <div className="pt-4 border-t border-stone-800 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-stone-300">
                  Obnovit ukázková data túr
                </h4>
                <p className="text-[11px] text-stone-500">
                  Vrátí předvyplněné výpravy (Sněžka, Rysy, Praděd) do výchozího stavu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Chcete obnovit ukázkové túry? Vaše vlastní túry budou nahrazeny.')) {
                    onResetData();
                    onClose();
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium border border-stone-700 transition-colors cursor-pointer"
              >
                Resetovat data túr
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
