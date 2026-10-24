import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Shield,
  KeyRound,
  FileText,
  Activity,
  Database,
  Download,
  Upload,
  Check,
  AlertCircle,
  ExternalLink,
  Lock,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminPin: string;
  readerPin: string;
  onUpdatePins: (adminPin: string, readerPin: string) => Promise<void>;
  routesCount: number;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearCache: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  adminPin,
  readerPin,
  onUpdatePins,
  routesCount,
  onExportBackup,
  onImportBackup,
  onClearCache,
}) => {
  const [activeTab, setActiveTab] = useState<'security' | 'garmin' | 'vop' | 'backup'>('security');
  const [adminPinInput, setAdminPinInput] = useState(adminPin || '0303');
  const [readerPinInput, setReaderPinInput] = useState(readerPin || '1234');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [isSavingPins, setIsSavingPins] = useState(false);

  useEffect(() => {
    setAdminPinInput(adminPin || '0303');
    setReaderPinInput(readerPin || '1234');
  }, [adminPin, readerPin, isOpen]);

  if (!isOpen) return null;

  const handleSavePins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPinInput.trim().length < 4) {
      setPinError('Heslo pro administrátora musí mít alespoň 4 znaky/číslice.');
      return;
    }
    if (readerPinInput.trim().length < 4) {
      setPinError('Heslo pro čtenáře musí mít alespoň 4 znaky/číslice.');
      return;
    }
    if (adminPinInput.trim() === readerPinInput.trim()) {
      setPinError('Heslo administrátora a čtenáře se musí lišit.');
      return;
    }

    setIsSavingPins(true);
    setPinError('');
    try {
      await onUpdatePins(adminPinInput.trim(), readerPinInput.trim());
      setPinSuccess(true);
      setTimeout(() => setPinSuccess(false), 3000);
    } catch (err: any) {
      setPinError(err.message || 'Chyba při ukládání hesel do cloudu.');
    } finally {
      setIsSavingPins(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Nastavení Horského deníku</h2>
              <p className="text-xs text-stone-400">Správa zabezpečení, Garmin synchronizace, VOP a zálohy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/40 px-3 sm:px-5 gap-1 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Zabezpečení & PIN</span>
          </button>

          <button
            onClick={() => setActiveTab('garmin')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'garmin'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Garmin Synchronizace</span>
          </button>

          <button
            onClick={() => setActiveTab('vop')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'vop'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Podmínky & VOP</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Záloha & Data</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm text-stone-300">
          {/* TAB 1: Security & PIN */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Globální cloudové zabezpečení pro všechna zařízení</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Hesla jsou synchronizována přes cloudovou databázi a platí jednotně pro všechna zařízení. Můžete nastavit samostatné heslo pro administrátora (plný přístup) a pro čtenáře (pouze prohlížení).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-emerald-950/40 border border-emerald-800/40 p-2.5 rounded-lg">
                    <span className="font-bold text-emerald-300 block mb-0.5">👑 Administrátor (Správce)</span>
                    <span className="text-stone-400 text-[11px]">Plný přístup: přidávání, úpravy, mazání tras, fotek a změna hesel.</span>
                  </div>
                  <div className="bg-stone-900 border border-stone-800 p-2.5 rounded-lg">
                    <span className="font-bold text-stone-200 block mb-0.5">📖 Čtenář (Návštěvník)</span>
                    <span className="text-stone-400 text-[11px]">Pouze ke čtení: prohlížení výprav, fotek, mapy a profilu bez možnosti změn.</span>
                  </div>
                </div>
              </div>

              <div className="bg-stone-950/50 border border-stone-800 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span>Nastavení globálních přístupových hesel</span>
                </h4>

                <form onSubmit={handleSavePins} className="space-y-4">
                  <div>
                    <label className="text-xs text-stone-300 font-semibold block mb-1">
                      👑 Heslo pro Administrátora (Správce)
                    </label>
                    <input
                      type="password"
                      maxLength={12}
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none tracking-widest font-mono"
                      placeholder="Heslo administrátora"
                      required
                    />
                    <span className="text-[11px] text-stone-500 mt-1 block">
                      Výchozí heslo administrátora: <strong className="text-emerald-400 font-mono">0303</strong>
                    </span>
                  </div>

                  <div>
                    <label className="text-xs text-stone-300 font-semibold block mb-1">
                      📖 Heslo pro Čtenáře (Pouze k nahlížení)
                    </label>
                    <input
                      type="password"
                      maxLength={12}
                      value={readerPinInput}
                      onChange={(e) => setReaderPinInput(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none tracking-widest font-mono"
                      placeholder="Heslo pro čtenáře"
                      required
                    />
                    <span className="text-[11px] text-stone-500 mt-1 block">
                      Výchozí heslo čtenáře: <strong className="text-stone-300 font-mono">1234</strong>
                    </span>
                  </div>

                  {pinError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950/50 p-3 rounded-xl border border-red-900/60">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{pinError}</span>
                    </div>
                  )}

                  {pinSuccess && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 p-3 rounded-xl border border-emerald-900/60 font-semibold">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Hesla byla úspěšně uložena do cloudové databáze a platí pro všechna zařízení!</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingPins}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition text-xs shadow flex items-center justify-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {isSavingPins ? 'Ukládám do cloudu...' : 'Uložit hesla pro všechna zařízení'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: Garmin Integration */}
          {activeTab === 'garmin' && (
            <div className="space-y-5">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Jak funguje nahrávání tras z Garminu</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Garmin Connect vyžaduje přihlášení uživatele ve vašem webovém prohlížeči (kvůli ochraně soukromí nedovoluje anonymním serverům automaticky stahovat cizí trasy bez vašeho hesla).
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                  Možnosti nahrávání aktivit
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-stone-950/60 border border-stone-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="font-semibold text-white text-xs mb-1">1. Přímé nahrání GPX souboru</div>
                      <p className="text-[11px] text-stone-400 leading-relaxed">
                        Kdykoliv máte z Garmin Connect stažený originální .GPX soubor, stačí kliknout nahoře na tlačítko <strong>+ Přidat výpravu</strong> a soubor přetáhnout. Aplikace načte všechny body i profil.
                      </p>
                    </div>
                    <a
                      href="https://connect.garmin.com/modern/activities"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Otevřít Garmin Connect aktivity
                    </a>
                  </div>

                  <div className="bg-stone-950/60 border border-stone-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="font-semibold text-white text-xs mb-1">2. Automatický Python skript</div>
                      <p className="text-[11px] text-stone-400 leading-relaxed">
                        Pokud používáte skript <code>upload_to_hiking_diary</code>, data odesílejte metodou POST na centrální serverový endpoint:
                      </p>
                      <code className="text-[10px] text-emerald-300 bg-stone-900 p-1.5 rounded block mt-1.5 font-mono break-all">
                        /api/routes (nebo /api/hikes)
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Terms & VOP */}
          {activeTab === 'vop' && (
            <div className="space-y-4 text-xs text-stone-300 leading-relaxed">
              <div className="border-b border-stone-800 pb-3">
                <h3 className="text-sm font-bold text-white">Všeobecné obchodní podmínky a zásady soukromí</h3>
                <p className="text-[11px] text-stone-500">Platné od: 1. ledna 2026 pro aplikaci Horský Deník</p>
              </div>

              <div className="space-y-3 bg-stone-950/60 p-4 rounded-xl border border-stone-800">
                <h4 className="font-bold text-white text-xs">1. Účel aplikace a vlastnictví dat</h4>
                <p>
                  Aplikace Horský deník slouží k osobní evidenci turistických výprav, vysokohorských túr, skialpových přechodů a sportovních aktivit. Veškerá nahraná data (GPS trasy, fotografie, osobní poznámky a hodnocení) zůstávají výhradním vlastnictvím uživatele.
                </p>

                <h4 className="font-bold text-white text-xs">2. Ochrana osobních údajů (GDPR)</h4>
                <p>
                  Aplikace nesleduje uživatele pomocí žádných reklamních či sledovacích skriptů. GPS souřadnice jsou zpracovávány výhradně za účelem vykreslení mapy a výškového profilu trasy. Žádná data nejsou předávána třetím stranám za účelem marketingu či monetizace.
                </p>

                <h4 className="font-bold text-white text-xs">3. Ukládání a zálohování fotografií</h4>
                <p>
                  Fotografie jsou ukládány v plném 4K Ultra HD rozlišení s optimalizací pro rychlé zobrazení. Uživatel nese plnou zodpovědnost za autorská práva k nahraným fotografiím.
                </p>

                <h4 className="font-bold text-white text-xs">4. Zabezpečení přístupu</h4>
                <p>
                  Přístup k aplikaci je chráněn nastavitelným bezpečnostním PIN kódem. Uživatel je povinen chránit svůj PIN před neoprávněnými osobami.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: Backup & Data */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-white text-xs">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Statistika databáze</span>
                  </div>
                  <span className="text-xs bg-emerald-950 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-800/60">
                    {routesCount} výprav
                  </span>
                </div>
                <p className="text-xs text-stone-400">
                  Všechny vaše výpravy můžete jedním kliknutím exportovat do záložního souboru JSON nebo vyčistit lokální mezipaměť při potížích se zobrazením.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onExportBackup}
                  className="p-4 bg-stone-950 border border-stone-800 hover:border-emerald-500 rounded-xl text-left transition space-y-1.5 group"
                >
                  <div className="flex items-center gap-2 text-white font-semibold text-xs group-hover:text-emerald-400 transition">
                    <Download className="w-4 h-4" />
                    <span>Stáhnout zálohu (JSON)</span>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    Stáhne kompletní soubor se všemi trasami a metadaty do vašeho zařízení.
                  </p>
                </button>

                <label className="p-4 bg-stone-950 border border-stone-800 hover:border-emerald-500 rounded-xl text-left transition space-y-1.5 cursor-pointer group block">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs group-hover:text-emerald-400 transition">
                    <Upload className="w-4 h-4" />
                    <span>Obnovit data ze zálohy</span>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    Nahraje dříve exportovaný JSON soubor a obnoví trasy v deníku.
                  </p>
                  <input
                    type="file"
                    accept=".json"
                    onChange={onImportBackup}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={onClearCache}
                  className="w-full py-2.5 bg-stone-950 hover:bg-red-950/40 text-stone-400 hover:text-red-400 border border-stone-800 hover:border-red-900/60 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Obnovit lokální mezipaměť (vyčistit dočasná data prohlížeče)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/60 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
