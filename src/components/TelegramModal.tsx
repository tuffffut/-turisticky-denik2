import React, { useState } from 'react';
import {
  X,
  Send,
  Bot,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Eye,
  Sparkles,
  Terminal,
  Smartphone,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { PinConfig, UserRole } from '../types';
import { getShareUrl } from '../utils/auth';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinConfig: PinConfig;
  currentRole: UserRole;
  onSimulateAddHike?: (command: string) => void;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  isOpen,
  onClose,
  pinConfig,
  currentRole,
  onSimulateAddHike,
}) => {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('/tura Lysá hora | Beskydy | 16.5km | +920m | slunečno');
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentHost}/api/telegram/webhook?secret=horsky_denik_${pinConfig.adminPin}`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2500);
  };

  const handleTestSimulate = () => {
    if (!testMessage.trim()) return;
    setSimulationStatus('Zpracovávám zprávu z Telegramu...');
    setTimeout(() => {
      if (onSimulateAddHike) {
        onSimulateAddHike(testMessage);
      }
      setSimulationStatus('Výprava byla úspěšně přijata z Telegramu a zaevidována do Deníku!');
      setTimeout(() => setSimulationStatus(null), 4000);
    }, 800);
  };

  return (
    <div
      id="telegram-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/85 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 animate-fadeIn"
    >
      <div
        id="telegram-modal-content"
        className="relative w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-6 text-stone-100 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-950 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-100">
                Telegram Integrace & Mobilní Asistent
              </h2>
              <p className="text-xs text-stone-400">
                Odesílání túr z terénu přímo z mobilního telefonu
              </p>
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

        <div className="p-5 sm:p-6 space-y-6 text-xs sm:text-sm">
          {/* Section 1: Quick direct links */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-stone-200">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Odkazy pro okamžité otevření v mobilním Telegramu</span>
            </div>
            <p className="text-stone-400 text-xs leading-relaxed">
              Při kliknutí na tento odkaz v chatu na Telegramu se deník otevře ihned odemčený, bez nutnosti vyťukávat PIN:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* Reader Link */}
              <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-cyan-400 text-xs">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Odkaz pro rodinu a přátele (Čtenář)</span>
                  </div>
                  <div className="font-mono text-[11px] text-stone-400 truncate mt-1">
                    {getShareUrl(pinConfig.readerPin)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(getShareUrl(pinConfig.readerPin), 'reader-link')}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedItem === 'reader-link' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Zkopírováno!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopírovat odkaz</span>
                    </>
                  )}
                </button>
              </div>

              {/* Admin Link */}
              <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-xs">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Správcovský odkaz (Admin)</span>
                  </div>
                  <div className="font-mono text-[11px] text-stone-400 truncate mt-1">
                    {getShareUrl(pinConfig.adminPin)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(getShareUrl(pinConfig.adminPin), 'admin-link')}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedItem === 'admin-link' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Zkopírováno!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopírovat správcovský odkaz</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: How to configure BotFather and Webhook */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-stone-200">
              <Bot className="w-4 h-4 text-sky-400" />
              <span>Návod: Jak propojit vlastního bota na Telegramu</span>
            </div>

            <ol className="space-y-2 text-xs text-stone-300 list-decimal list-inside leading-relaxed">
              <li>
                Otevřete Telegram a vyhledejte účet <strong className="text-stone-100">@BotFather</strong>.
              </li>
              <li>
                Zadejte příkaz <code className="text-emerald-400 font-mono">/newbot</code> a pojmenujte svého bota (např. <em>MujHorskyDeníkBot</em>).
              </li>
              <li>
                BotFather vám vygeneruje <strong>HTTP API Token</strong> (např. <code className="font-mono text-stone-400">7123456789:AAHk...</code>).
              </li>
              <li>
                Nastavte Webhook na vaši adresu serveru pomocí tohoto odkazu:
              </li>
            </ol>

            <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                  Webhook URL koncový bod:
                </div>
                <div className="text-xs font-mono text-stone-200 truncate select-all">
                  {webhookUrl}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(webhookUrl, 'webhook-url')}
                className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedItem === 'webhook-url' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Kopírovat</span>
              </button>
            </div>
          </div>

          {/* Section 3: Telegram Command Format & Interactive Simulator */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-stone-200">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>Vyzkoušet Telegram formát zpráv (Simulátor)</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60 font-medium">
                Živý test
              </span>
            </div>

            <p className="text-xs text-stone-400 leading-relaxed">
              V terénu stačí do Telegram chatu napsat zprávu s parametry oddělenými svislítkem <code className="text-stone-200">|</code>. Vyzkoušejte si, jak systém zprávu ihned zpracuje:
            </p>

            {simulationStatus && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-900/80 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{simulationStatus}</span>
              </div>
            )}

            <div className="space-y-2">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="/tura Vrchol | Pohoří | 15km | +900m | počasí"
                className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-xl text-xs font-mono text-stone-200 focus:outline-none focus:border-sky-500"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                  <span>Rychlé šablony:</span>
                  <button
                    type="button"
                    onClick={() => setTestMessage('/tura Lysá hora | Beskydy | 16.5km | +920m | slunečno')}
                    className="hover:text-stone-200 underline cursor-pointer"
                  >
                    Beskydy
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setTestMessage('/tura Kriváň | Vysoké Tatry | 14.8km | +1350m | polojasno')}
                    className="hover:text-stone-200 underline cursor-pointer"
                  >
                    Tatry
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestSimulate}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Simulovat odeslání z Telegramu</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Garmin & Telegram Deep Linking Documentation */}
          <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-stone-200">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Parametry pro odkaz z Telegramu a Garmin skriptu</span>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Při kliknutí na odkaz se aplikace automaticky odemkne a rovnou otevře detail trasy nebo předvyplněný formulář:
            </p>

            <div className="space-y-2.5">
              {/* Route Detail Link */}
              <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-stone-300">
                    1. Otevření detailu konkrétní trasy (?routeId=...)
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 truncate">
                    {`${currentHost}/?key=1234&routeId=hike-1`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`${currentHost}/?key=1234&routeId=hike-1`, 'route-example')}
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedItem === 'route-example' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Kopírovat</span>
                </button>
              </div>

              {/* Garmin Add Route Link */}
              <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-stone-300">
                    2. Garmin skript – automatické předvyplnění (?newRoute=true)
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 truncate">
                    {`${currentHost}/?key=1234&newRoute=true&title=Snezka&distance=14.5&elevation=850&time=03:45:00`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `${currentHost}/?key=1234&newRoute=true&title=Snezka&distance=14.5&elevation=850&time=03:45:00`,
                      'garmin-example'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedItem === 'garmin-example' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Kopírovat</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-stone-900 border-t border-stone-800 flex justify-end">
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
