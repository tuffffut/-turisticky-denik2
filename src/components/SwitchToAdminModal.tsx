import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { PinConfig } from '../types';

interface SwitchToAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinConfig: PinConfig;
  onSuccess: () => void;
}

export const SwitchToAdminModal: React.FC<SwitchToAdminModalProps> = ({
  isOpen,
  onClose,
  pinConfig,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim() === pinConfig.adminPin.trim()) {
      onSuccess();
      onClose();
      setPin('');
      setError(null);
    } else {
      setError('Nesprávné Admin heslo / PIN.');
      setPin('');
    }
  };

  return (
    <div
      id="switch-to-admin-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fadeIn"
    >
      <div
        id="switch-to-admin-modal-card"
        className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-200 p-1 rounded-lg hover:bg-stone-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/90 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-100">Přepnout na Admin</h3>
            <p className="text-xs text-stone-400">Zadejte Admin PIN pro plný přístup</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-stone-300">
                Správcovské heslo / PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-stone-400 hover:text-stone-200 p-0.5 rounded transition-colors"
                title={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                maxLength={32}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={showPassword ? 'Zadejte heslo nebo PIN' : '••••'}
                className="w-full text-center text-xl tracking-widest py-2.5 px-4 bg-stone-950 border border-stone-700 rounded-xl text-stone-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-rose-400 text-xs mt-2 bg-rose-950/40 p-2 rounded-lg border border-rose-900/50">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <p className="text-[11px] text-stone-500 mt-2">
              Výchozí Admin PIN je <span className="font-mono text-stone-400">1234</span> (pokud jste jej nezměnili v nastavení).
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={!pin}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>Ověřit</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
