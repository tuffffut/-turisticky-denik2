import React, { useState } from 'react';
import { Lock, Unlock, X, KeyRound, AlertCircle } from 'lucide-react';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storedPin: string;
  onUpdatePin?: (newPin: string) => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  storedPin,
  onUpdatePin,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [changeSuccess, setChangeSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/security/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) {
        setError(false);
        setPinInput('');
        onSuccess();
        return;
      }
    } catch {}

    if (pinInput === storedPin || pinInput === '1234') {
      setError(false);
      setPinInput('');
      onSuccess();
    } else {
      setError(true);
      setPinInput('');
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.length < 4) {
      setError(true);
      return;
    }

    let serverSuccess = false;
    try {
      const res = await fetch('/api/security/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: currentPinInput, newPin: newPinInput }),
      });
      if (res.ok) {
        serverSuccess = true;
      }
    } catch {}

    if (currentPinInput === storedPin || currentPinInput === '1234' || serverSuccess) {
      if (onUpdatePin) {
        onUpdatePin(newPinInput);
      }
      setChangeSuccess(true);
      setTimeout(() => {
        setChangeSuccess(false);
        setShowChangePin(false);
        setCurrentPinInput('');
        setNewPinInput('');
      }, 1500);
    } else {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative animate-fadeIn">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="inline-flex p-3 bg-emerald-950/80 border border-emerald-800/60 rounded-2xl text-emerald-400 mb-2.5 shadow-lg shadow-emerald-950/50">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {showChangePin ? 'Změna bezpečnostního hesla / PINu' : 'Zabezpečený Horský deník'}
          </h3>
          <p className="text-xs text-stone-400 mt-1">
            {showChangePin
              ? 'Zadejte stávající a nový minimálně 4místný PIN.'
              : 'Zadejte heslo / PIN pro přístup k deníku, mapám a fotografiím.'}
          </p>
        </div>

        {!showChangePin ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinInput}
                onChange={(e) => {
                  setError(false);
                  setPinInput(e.target.value);
                }}
                autoFocus
                placeholder="••••"
                className="w-full text-center tracking-[0.5em] text-2xl font-bold bg-stone-950 border border-stone-800 rounded-xl py-3 text-stone-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-stone-700"
              />
              <div className="text-center mt-1.5">
                <span className="text-[11px] text-stone-500">
                  Výchozí bezpečnostní PIN: <strong className="text-emerald-400 font-mono">1234</strong>
                </span>
              </div>
              {error && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-red-400 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Nesprávný PIN. Zadejte 1234 nebo váš změněný PIN.</span>
                </div>
              )}
            </div>

            {/* Quick numeric touch keypad */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setError(false);
                    if (k === 'C') {
                      setPinInput('');
                    } else if (k === '⌫') {
                      setPinInput((prev) => prev.slice(0, -1));
                    } else if (pinInput.length < 8) {
                      setPinInput((prev) => prev + k);
                    }
                  }}
                  className={`py-2 rounded-xl text-sm font-semibold transition border ${
                    k === 'C' || k === '⌫'
                      ? 'bg-stone-950 border-stone-800/80 text-stone-400 hover:text-white hover:bg-stone-800'
                      : 'bg-stone-800/70 hover:bg-stone-700/80 border-stone-700/60 text-white'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-800 text-sm font-medium transition"
              >
                Host (pouze čtení)
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-1.5"
              >
                <Unlock className="w-4 h-4" />
                Odemknout deník
              </button>
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowChangePin(true);
                  setError(false);
                }}
                className="text-xs text-stone-500 hover:text-stone-300 transition inline-flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3" />
                Změnit bezpečnostní PIN
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="text-xs text-stone-400 block mb-1">Stávající PIN</label>
              <input
                type="password"
                maxLength={8}
                value={currentPinInput}
                onChange={(e) => setCurrentPinInput(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Aktuální PIN"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 block mb-1">Nový PIN (min. 4 číslice)</label>
              <input
                type="password"
                maxLength={8}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Nový PIN"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 text-center">
                Nesprávný starý PIN nebo krátký nový PIN.
              </div>
            )}

            {changeSuccess && (
              <div className="text-xs text-emerald-400 text-center font-medium">
                PIN byl úspěšně změněn!
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowChangePin(false)}
                className="flex-1 py-2 rounded-xl border border-stone-800 text-stone-400 text-sm hover:bg-stone-800"
              >
                Zpět
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                Uložit PIN
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
