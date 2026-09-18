import React, { useState, useEffect } from 'react';
import { Mountain, Lock, KeyRound, Eye, ShieldCheck, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { UserRole, PinConfig } from '../types';
import { authenticatePin } from '../utils/auth';

interface LockScreenProps {
  pinConfig: PinConfig;
  onUnlock: (role: UserRole) => void;
  initialError?: string | null;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  pinConfig,
  onUnlock,
  initialError,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(initialError || null);
  const [isShaking, setIsShaking] = useState(false);
  const [showDefaultHint, setShowDefaultHint] = useState(true);

  // Clear error when PIN changes
  useEffect(() => {
    if (error) setError(null);
  }, [pin]);

  const handleAttemptUnlock = (pinToTest: string) => {
    const role = authenticatePin(pinToTest, pinConfig);
    if (role) {
      onUnlock(role);
    } else {
      setError('Nesprávný PIN. Zkuste to prosím znovu.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPin('');
    }
  };

  const handleKeypadPress = (val: string) => {
    if (pin.length < 8) {
      const next = pin + val;
      setPin(next);
      // Auto submit on 4 chars if it matches admin or reader
      if (next.length === 4) {
        const role = authenticatePin(next, pinConfig);
        if (role) {
          onUnlock(role);
          return;
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    handleAttemptUnlock(pin);
  };

  return (
    <div
      id="lock-screen-container"
      className="relative min-h-screen w-full flex items-center justify-center bg-stone-950 px-4 py-8 overflow-hidden"
    >
      {/* Mountain atmospheric background */}
      <div
        className="absolute inset-0 z-0 opacity-25 bg-cover bg-center filter saturate-50"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2000&q=80")',
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-stone-950 via-stone-950/85 to-stone-950/70" />

      {/* Main Lock Card */}
      <div
        id="lock-screen-card"
        className={`relative z-10 w-full max-w-md bg-stone-900/95 border border-stone-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md transition-transform duration-200 ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
            <Mountain className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-100 flex items-center gap-2">
            Horský Deník
          </h1>
          <p className="text-stone-400 text-sm mt-1 max-w-xs">
            Aplikace je uzamčena. Zadejte přístupový PIN pro otevření vašich horských výprav.
          </p>
        </div>

        {/* PIN Input form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="relative flex items-center justify-center">
              <input
                id="pin-input-field"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • •"
                className="w-full text-center text-3xl tracking-[0.6em] py-3.5 px-4 bg-stone-950/80 border border-stone-700/80 rounded-xl text-stone-100 font-mono placeholder:text-stone-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                autoFocus
              />
              <div className="absolute right-3 text-stone-500 pointer-events-none">
                <Lock className="w-5 h-5" />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                id="lock-error-alert"
                className="flex items-center gap-2 text-rose-400 text-xs mt-2.5 bg-rose-950/40 border border-rose-900/50 py-2 px-3 rounded-lg"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Onscreen Keypad */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                id={`keypad-btn-${digit}`}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="h-12 sm:h-13 bg-stone-800/80 hover:bg-stone-700/90 active:bg-stone-600 text-stone-200 text-xl font-semibold rounded-xl border border-stone-700/50 transition-colors shadow-sm flex items-center justify-center cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              id="keypad-btn-clear"
              type="button"
              onClick={handleClear}
              className="h-12 sm:h-13 bg-stone-800/40 hover:bg-stone-800 text-stone-400 hover:text-stone-200 text-sm font-medium rounded-xl border border-stone-800 transition-colors flex items-center justify-center cursor-pointer"
            >
              C
            </button>
            <button
              id="keypad-btn-0"
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="h-12 sm:h-13 bg-stone-800/80 hover:bg-stone-700/90 active:bg-stone-600 text-stone-200 text-xl font-semibold rounded-xl border border-stone-700/50 transition-colors shadow-sm flex items-center justify-center cursor-pointer"
            >
              0
            </button>
            <button
              id="keypad-btn-backspace"
              type="button"
              onClick={handleBackspace}
              className="h-12 sm:h-13 bg-stone-800/40 hover:bg-stone-800 text-stone-400 hover:text-stone-200 text-sm font-medium rounded-xl border border-stone-800 transition-colors flex items-center justify-center cursor-pointer"
            >
              ←
            </button>
          </div>

          {/* Primary Submit Button */}
          <button
            id="unlock-submit-btn"
            type="submit"
            disabled={!pin}
            className={`w-full py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
              pin
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                : 'bg-stone-800/50 text-stone-500 border border-stone-800 cursor-not-allowed'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Odemknout aplikaci</span>
          </button>
        </form>

        {/* Roles & Quick Test Helper Box */}
        <div className="mt-6 pt-5 border-t border-stone-800/80">
          <div className="flex items-center justify-between text-xs text-stone-400 mb-2.5">
            <span className="flex items-center gap-1.5 font-medium text-stone-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Rychlý přístup pro testování:
            </span>
            <button
              type="button"
              onClick={() => setShowDefaultHint(!showDefaultHint)}
              className="text-stone-400 hover:text-stone-200 underline cursor-pointer"
            >
              {showDefaultHint ? 'Skrýt' : 'Zobrazit'}
            </button>
          </div>

          {showDefaultHint && (
            <div className="space-y-2 text-xs">
              <button
                type="button"
                id="quick-unlock-admin-btn"
                onClick={() => handleAttemptUnlock(pinConfig.adminPin)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-stone-950/60 hover:bg-emerald-950/40 border border-stone-800 hover:border-emerald-700/50 text-stone-300 transition-colors text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-emerald-900/50 text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-stone-100">Správce (Admin)</span>
                    <span className="text-stone-400 ml-1.5 font-mono">PIN: {pinConfig.adminPin}</span>
                    <p className="text-[11px] text-stone-400">Plný přístup k úpravám a nahrávání tras</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-500 group-hover:text-emerald-400 transition-colors" />
              </button>

              <button
                type="button"
                id="quick-unlock-reader-btn"
                onClick={() => handleAttemptUnlock(pinConfig.readerPin)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-stone-950/60 hover:bg-cyan-950/40 border border-stone-800 hover:border-cyan-700/50 text-stone-300 transition-colors text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-cyan-900/50 text-cyan-400 flex items-center justify-center shrink-0">
                    <Eye className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-stone-100">Čtenář (Host)</span>
                    <span className="text-stone-400 ml-1.5 font-mono">PIN: {pinConfig.readerPin}</span>
                    <p className="text-[11px] text-stone-400">Pouze pro čtení tras, map a fotek</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-500 group-hover:text-cyan-400 transition-colors" />
              </button>

              <div className="p-2 bg-stone-950/40 rounded border border-stone-800/60 text-[11px] text-stone-400 flex items-start gap-1.5">
                <span className="text-stone-300 font-medium shrink-0">Tip k URL:</span>
                <span>
                  Odkazy s parametrem např.{' '}
                  <code className="text-emerald-400 font-mono">?key={pinConfig.adminPin}</code> nebo{' '}
                  <code className="text-cyan-400 font-mono">?key={pinConfig.readerPin}</code> odemknou deník okamžitě
                  bez zadávání kódu.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
