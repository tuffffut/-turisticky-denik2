import React, { useState } from 'react';
import { Smartphone, Download, Check, X, Share, PlusSquare, MoreVertical, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If app is already running as standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setJustInstalled(true);
        setTimeout(() => setJustInstalled(false), 5000);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        title="Nainstalovat Horský Deník do mobilu nebo počítače"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/30 transition-all transform active:scale-95 border border-emerald-400/30"
      >
        {justInstalled ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-200" />
            <span>Nainstalováno!</span>
          </>
        ) : (
          <>
            <Smartphone className="w-3.5 h-3.5 text-emerald-200 animate-pulse" />
            <span className="hidden sm:inline">Nainstalovat aplikaci</span>
            <span className="sm:hidden">Instalovat</span>
          </>
        )}
      </button>

      {/* Guide Modal for iOS or manual install on Android/Desktop */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl p-6 text-stone-200 overflow-hidden">
            {/* Header decor */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    Instalace Horského Deníku
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                  </h3>
                  <p className="text-xs text-stone-400">Plnohodnotná mobilní aplikace bez Google Play</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-stone-300">
              {isIOS ? (
                // iOS Safari specific steps
                <div className="bg-stone-800/60 rounded-xl p-4 border border-stone-700/60 space-y-3">
                  <div className="font-semibold text-emerald-400 text-sm">Postup na iPhone / iPad (Safari):</div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      Klepněte na ikonu <strong className="text-white">Sdílet</strong>{' '}
                      <Share className="inline w-3.5 h-3.5 text-blue-400 mx-0.5" /> ve spodní liště Safari.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      V nabídce sjeďte níže a vyberte <strong className="text-white">Přidat na plochu</strong>{' '}
                      <PlusSquare className="inline w-3.5 h-3.5 text-stone-300 mx-0.5" />.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      Potvrďte klepnutím na <strong className="text-emerald-400">Přidat</strong> vpravo nahoře.
                    </div>
                  </div>
                </div>
              ) : (
                // Android Chrome / Chromium / Desktop steps
                <div className="bg-stone-800/60 rounded-xl p-4 border border-stone-700/60 space-y-3">
                  <div className="font-semibold text-emerald-400 text-sm">
                    {isAndroid ? 'Postup na Androidu (Google Chrome):' : 'Postup v prohlížeči (Chrome, Edge):'}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      Klepněte na nabídku se <strong className="text-white">třemi tečkami ⋮</strong>{' '}
                      <MoreVertical className="inline w-3.5 h-3.5 text-stone-300 mx-0.5" /> v pravém horním rohu prohlížeče.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      Zvolte možnost <strong className="text-white">Nainstalovat aplikaci</strong> nebo{' '}
                      <strong className="text-white">Přidat na plochu</strong>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      Potvrďte instalaci. Na ploše se vám vytvoří samostatná ikona Horského Deníku!
                    </div>
                  </div>
                </div>
              )}

              {/* Benefits list */}
              <div className="border-t border-stone-800 pt-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-stone-400 mb-2">Výhody aplikace na ploše:</div>
                <ul className="space-y-1 text-stone-300 text-[11px]">
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Běží na celou obrazovku bez lišt prohlížeče (jako nativní aplikace)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Bleskové spouštění z plochy telefonu</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Funguje i offline v horách na dříve zobrazených mapách a trasách</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowGuideModal(false)}
                className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-medium text-xs transition border border-stone-700"
              >
                Rozumím, zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
