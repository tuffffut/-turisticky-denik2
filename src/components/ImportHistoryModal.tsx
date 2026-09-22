import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Loader2,
  Download,
  Info,
  Layers,
} from 'lucide-react';
import { MountainHike } from '../types';
import { saveHikesBatchToFirestore } from '../utils/firebase';
import { detectMountainRange } from '../utils/gpxParser';

function inferRangeFromTitleAndCoords(title: string, lat?: number, lng?: number): string {
  const t = title.toLowerCase();
  if (t.includes('hohen wand')) return 'Vídeňské Alpy (Hohen Wand)';
  if (t.includes('schneeberg')) return 'Vídeňské Alpy (Schneeberg)';
  if (t.includes('rax')) return 'Vídeňské Alpy (Rax)';
  if (t.includes('semmering')) return 'Vídeňské Alpy (Semmering)';
  if (t.includes('gesäuse') || t.includes('gesause')) return 'Ennstalské Alpy (Gesäuse)';
  if (t.includes('dachstein')) return 'Dachstein a Salzkammergut';
  if (t.includes('dolomit')) return 'Dolomity (Itálie)';
  if (t.includes('triglav') || t.includes('julsk')) return 'Julské Alpy (Slovinsko)';
  if (t.includes('sněžk') || t.includes('krkonoš') || t.includes('špindl') || t.includes('pec pod')) return 'Krkonoše';
  if (t.includes('praděd') || t.includes('jeseník')) return 'Jeseníky';
  if (t.includes('lysá hora') || t.includes('beskyd') || t.includes('smrk')) return 'Beskydy';
  if (t.includes('tatr') || t.includes('gerlach') || t.includes('rysy') || t.includes('kriváň')) return 'Vysoké Tatry';
  if (t.includes('fatra')) return 'Malá Fatra';
  if (t.includes('šumav')) return 'Šumava';
  if (t.includes('litomyšl') || t.includes('svitav')) return 'Českomoravské pomezí (Litomyšlsko)';

  if (lat && lng) {
    const detected = detectMountainRange([{ lat, lng, distFromStartKm: 0 }]);
    if (detected) return detected;
  }
  return 'Historická výprava';
}

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHikesImported?: () => void;
}

export const ImportHistoryModal: React.FC<ImportHistoryModalProps> = ({
  isOpen,
  onClose,
  onHikesImported,
}) => {
  const [tab, setTab] = useState<'json' | 'paste'>('json');
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [parsedHikes, setParsedHikes] = useState<MountainHike[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleJsonSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonFile(file);
    setErrorMsg(null);
    setIsComplete(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        const list = Array.isArray(data) ? data : data.hikes || data.routes || [];
        if (!Array.isArray(list) || list.length === 0) {
          throw new Error('Soubor neobsahuje platný seznam tras.');
        }

        // Validate and clean hikes
        const validHikes: MountainHike[] = list.map((item: any, idx: number) => {
          const id = item.id || `garmin-${item.act_id || idx}`;
          const title = item.title || 'Horská výprava';
          const date = item.date || item.time || new Date().toISOString().split('T')[0];
          return {
            ...item,
            id,
            title,
            date,
            photos: Array.isArray(item.photos) ? item.photos : [],
          };
        });

        setParsedHikes(validHikes);
      } catch (err: any) {
        setErrorMsg(err.message || 'Nepodařilo se přečíst soubor JSON.');
        setParsedHikes([]);
      }
    };
    reader.readAsText(file);
  };

  const handleParsePastedSheet = () => {
    if (!pastedText.trim()) {
      setErrorMsg('Vložte zkopírované řádky z Google Tabulky.');
      return;
    }
    setErrorMsg(null);
    try {
      const lines = pastedText.trim().split('\n');
      const results: MountainHike[] = [];

      // Find header column indices if header row is provided
      let colMap: Record<string, number> = {};
      const firstLineCols = lines[0].split('\t').map((c) => c.trim().toLowerCase());
      const hasHeader = firstLineCols.some((c) => c.includes('datum') || c.includes('název') || c.includes('typ'));

      if (hasHeader) {
        firstLineCols.forEach((col, idx) => {
          if (col.includes('datum')) colMap.date = idx;
          else if (col.includes('název')) colMap.title = idx;
          else if (col.includes('typ')) colMap.type = idx;
          else if (col.includes('vzdálenost')) colMap.dist = idx;
          else if (col.includes('celkem')) colMap.duration = idx;
          else if (col.includes('pohybu') && colMap.duration === undefined) colMap.duration = idx;
          else if (col.includes('převýšení')) colMap.elev = idx;
          else if (col.includes('garmin') || col.includes('activity id')) colMap.actId = idx;
          else if (col.includes('gpx')) colMap.gpx = idx;
          else if (col.includes('start') && col.includes('lat')) colMap.startLat = idx;
          else if (col.includes('start') && (col.includes('lon') || col.includes('lng'))) colMap.startLon = idx;
        });
      }

      for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split('\t');

        const getCol = (key: string, defaultIdx: number) => {
          const idx = colMap[key] !== undefined ? colMap[key] : defaultIdx;
          return (cols[idx] || '').trim();
        };

        const dateRaw = getCol('date', 0);
        const title = getCol('title', 1) || 'Horská túra';
        const typeRaw = getCol('type', 2).toLowerCase();

        // Skip non-hiking/climbing
        if (typeRaw && !['hiking', 'chůze', 'turistika', 'walking', 'mountaineering', 'climbing', 'rock_climbing'].includes(typeRaw)) {
          continue;
        }

        const distStr = getCol('dist', 3).replace(' ', '').replace(',', '.');
        let dist = parseFloat(distStr) || 0;
        if (dist > 100) dist = dist / 1000; // in meters

        const duration = getCol('duration', 5) || getCol('duration', 4);
        const elevStr = getCol('elev', 6).replace(' ', '').replace(',', '.');
        const elev = Math.round(parseFloat(elevStr) || 0);

        const actId = getCol('actId', 20);
        const latVal = parseFloat(getCol('startLat', 23).replace(' ', '').replace(',', '.'));
        const lonVal = parseFloat(getCol('startLon', 24).replace(' ', '').replace(',', '.'));
        const startLat = !isNaN(latVal) && latVal !== 0 ? latVal : undefined;
        const startLon = !isNaN(lonVal) && lonVal !== 0 ? lonVal : undefined;

        const hikeId = actId ? `garmin-${actId}` : `import-${Date.now()}-${i}`;
        const isClimb = typeRaw.includes('climb') || typeRaw.includes('mountaineer');
        const range = inferRangeFromTitleAndCoords(title, startLat, startLon);

        results.push({
          id: hikeId,
          title,
          mountainRange: range,
          activityType: isClimb ? 'climbing' : 'hiking',
          date: dateRaw.slice(0, 10),
          distanceKm: Math.round(dist * 10) / 10,
          elevationGainM: elev,
          elevationLossM: elev,
          duration: duration || '0m',
          difficulty: elev >= 1000 || dist >= 22 ? 'hard' : elev <= 350 && dist <= 10 ? 'easy' : 'moderate',
          description: `Záznam z hodinek Garmin (${typeRaw || 'turistika'}).`,
          photos: [],
          peakCoords: {
            lat: startLat || (range.includes('Vídeňské') ? 47.78 : range.includes('Jeseník') ? 50.08 : 50.0),
            lng: startLon || (range.includes('Vídeňské') ? 15.9 : range.includes('Jeseník') ? 17.23 : 15.0),
            name: title,
          },
          gpxRawXml: undefined,
        });
      }

      if (results.length === 0) {
        throw new Error('V zadaném textu nebyly nalezeny žádné platné řádky s turistikou nebo lezením.');
      }

      setParsedHikes(results);
    } catch (err: any) {
      setErrorMsg(err.message || 'Chyba při zpracování tabulky.');
    }
  };

  const handleStartImport = async () => {
    if (parsedHikes.length === 0) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setProgress({ current: 0, total: parsedHikes.length });

    try {
      await saveHikesBatchToFirestore(parsedHikes, (current, total) => {
        setProgress({ current, total });
      });

      setIsComplete(true);
      if (onHikesImported) {
        onHikesImported();
      }
    } catch (err: any) {
      setErrorMsg(`Chyba při ukládání do Firestore: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-100">
                Hromadný import historie výprav
              </h2>
              <p className="text-xs text-stone-400">
                Jednorázové nahrání tras do databáze Firestore
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Tabs */}
          <div className="flex rounded-xl bg-stone-950/60 p-1 border border-stone-800">
            <button
              onClick={() => {
                setTab('json');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                tab === 'json'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>Nahrát JSON soubor (Doporučeno)</span>
            </button>
            <button
              onClick={() => {
                setTab('paste');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                tab === 'paste'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Vložit přímo ze Sheets</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          {isComplete ? (
            <div className="p-6 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-stone-100">
                Import byl úspěšně dokončen!
              </h3>
              <p className="text-xs text-stone-300 max-w-md mx-auto">
                Do vašeho Horského deníku bylo uloženo{' '}
                <span className="font-semibold text-emerald-400">
                  {parsedHikes.length} výprav
                </span>
                . Data jsou trvale uložena v cloudu a okamžitě dostupná na všech vašich zařízeních.
              </p>
              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition-colors"
                >
                  Otevřít Horský deník
                </button>
              </div>
            </div>
          ) : tab === 'json' ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-700 hover:border-emerald-500/70 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-stone-950/30 hover:bg-stone-950/60"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleJsonSelect}
                  accept=".json"
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-stone-200">
                  {jsonFile ? jsonFile.name : 'Klikněte pro výběr souboru hikes_export.json'}
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  Vygenerovaného vaším skriptem import_history.py
                </p>
              </div>

              {parsedHikes.length > 0 && (
                <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Počet nalezených tras:</span>
                    <span className="font-semibold text-stone-200">
                      {parsedHikes.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Časový rozsah:</span>
                    <span className="font-medium text-stone-300">
                      {parsedHikes[parsedHikes.length - 1]?.date} — {parsedHikes[0]?.date}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Celková vzdálenost:</span>
                    <span className="font-medium text-emerald-400">
                      {Math.round(parsedHikes.reduce((sum, h) => sum + (h.distanceKm || 0), 0))}{' '}
                      km
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-300 block mb-1">
                  Zkopírujte a vložte řádky z Google Tabulky (včetně sloupců Datum, Název, Typ...):
                </label>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="2025-04-18 8:40:23&#9;Höflein an der Hohen Wand Turistika&#9;hiking&#9;14,185&#9;..."
                  rows={6}
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedSheet}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-lg border border-stone-700 transition-colors"
                >
                  Naparsovat vložený text
                </button>
              </div>

              {parsedHikes.length > 0 && (
                <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-300">
                  Nalezeno <span className="font-bold text-emerald-400">{parsedHikes.length}</span> platných tras připravených k uložení.
                </div>
              )}
            </div>
          )}

          {isProcessing && progress && (
            <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-300">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Ukládám do databáze Firestore...</span>
                </span>
                <span className="font-mono text-emerald-400">
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{
                    width: `${Math.round((progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isComplete && (
          <div className="px-6 py-4 border-t border-stone-800 bg-stone-950/50 flex items-center justify-between">
            <div className="text-xs text-stone-500">
              {parsedHikes.length > 0
                ? `Připraveno ${parsedHikes.length} tras`
                : 'Vyberte soubor nebo vložte data'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-xl transition-colors"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleStartImport}
                disabled={parsedHikes.length === 0 || isProcessing}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow transition-colors flex items-center gap-1.5"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Importuji...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Nahrát do deníku</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
