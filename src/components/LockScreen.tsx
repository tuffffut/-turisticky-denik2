import React, { useState, useEffect } from 'react';
import { Mountain, KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);
  const [isShaking, setIsShaking] = useState(false);

  // Sync initial error
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  // Clear error when PIN changes
  useEffect(() => {
    if (error) setError(null);
  }, [pin]);

  const handleAttemptUnlock = (pinToTest: string) => {
    const role = authenticatePin(pinToTest, pinConfig);
    if (role) {
      onUnlock(role);
    } else {
      setError('Nesprávné heslo nebo PIN. Zkuste to prosím znovu.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPin('');
    }
  };

  const handleKeypadPress = (val: string) => {
    if (pin.length < 32) {
      const next = pin + val;
      setPin(next);
      // Auto submit if typed code matches admin or reader password exactly
      if (next === pinConfig.adminPin || next === pinConfig.readerPin) {
        handleAttemptUnlock(next);
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
          <p className="text-stone-400 text-sm mt-1">
            Osobní deník horských výprav
          </p>
        </div>

        {/* PIN Input form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="relative flex items-center justify-center">
              <input
                id="pin-input-field"
                type={showPassword ? 'text' : 'password'}
                maxLength={32}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="• • • •"
                className="w-full text-center text-xl sm:text-2xl tracking-[0.2em] py-3.5 pl-4 pr-11 bg-stone-950/80 border border-stone-700/80 rounded-xl text-stone-100 font-mono placeholder:text-stone-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-stone-400 hover:text-stone-200 p-1 rounded-lg transition-colors cursor-pointer"
                title={showPassword ? 'Skrýt' : 'Zobrazit'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
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
      </div>
    </div>
  );
};
