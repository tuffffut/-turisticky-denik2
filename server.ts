import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { detectMountainRangeFromCoords, isSuspectMountainRange } from './src/utils/mountainRanges';

// Helper for distance calculation
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Server-side GPX track parser (robust regex-based with Garmin odometer extraction, duration & date)
function parseServerGpx(xmlString: string) {
  const points: { lat: number; lng: number; ele?: number; time?: string; distFromStartKm?: number }[] = [];
  const ptRegex = /<(?:trkpt|rtept|wpt)\s+[^>]*lat=["']([^"']+)["']\s+[^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;
  const ptRegex2 = /<(?:trkpt|rtept|wpt)\s+[^>]*lon=["']([^"']+)["']\s+[^>]*lat=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;

  const raw: { lat: number; lng: number; ele?: number; time?: string; timestampMs?: number; embeddedDistM?: number }[] = [];
  let match;
  let firstTimestamp: Date | null = null;
  let lastTimestamp: Date | null = null;

  while ((match = ptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const inner = match[3];
    const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(inner);
    const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
    const distMatch = /<(?:(?:gpxtpx:)?distance)>([0-9.-]+)<\/(?:(?:gpxtpx:)?distance)>/i.exec(inner);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
    const time = timeMatch ? timeMatch[1].trim() : undefined;
    const embeddedDistM = distMatch ? parseFloat(distMatch[1]) : undefined;
    let timestampMs: number | undefined = undefined;
    if (time) {
      const d = new Date(time);
      if (!isNaN(d.getTime())) {
        timestampMs = d.getTime();
        if (!firstTimestamp) firstTimestamp = d;
        lastTimestamp = d;
      }
    }
    if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
      raw.push({ lat, lng, ele, time, timestampMs, embeddedDistM });
    }
  }

  if (raw.length === 0) {
    while ((match = ptRegex2.exec(xmlString)) !== null) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      const inner = match[3];
      const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(inner);
      const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
      const distMatch = /<(?:(?:gpxtpx:)?distance)>([0-9.-]+)<\/(?:(?:gpxtpx:)?distance)>/i.exec(inner);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
      const time = timeMatch ? timeMatch[1].trim() : undefined;
      const embeddedDistM = distMatch ? parseFloat(distMatch[1]) : undefined;
      let timestampMs: number | undefined = undefined;
      if (time) {
        const d = new Date(time);
        if (!isNaN(d.getTime())) {
          timestampMs = d.getTime();
          if (!firstTimestamp) firstTimestamp = d;
          lastTimestamp = d;
        }
      }
      if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
        raw.push({ lat, lng, ele, time, timestampMs, embeddedDistM });
      }
    }
  }

  let totalDistKm = 0;
  let minEle = Number.POSITIVE_INFINITY;
  let maxEle = Number.NEGATIVE_INFINITY;
  let highestPoint = raw[0];
  let calculatedGain = 0;
  let calculatedLoss = 0;
  let movingDurationSecs = 0;

  for (let i = 0; i < raw.length; i++) {
    const pt = raw[i];
    if (i > 0) {
      const prev = raw[i - 1];
      // True 2D surface distance (standard Great Circle / Haversine)
      const d2d = haversineDistanceKm(prev.lat, prev.lng, pt.lat, pt.lng);

      let dtSecs: number | null = null;
      if (prev.timestampMs && pt.timestampMs) {
        dtSecs = (pt.timestampMs - prev.timestampMs) / 1000;
      }

      const speedKmh = dtSecs && dtSecs > 0 ? d2d / (dtSecs / 3600) : null;
      const isGlitch = speedKmh !== null && speedKmh > 150;

      // Accumulate distance without discarding valid slow movements (> 0.2m)
      if (!isGlitch && d2d >= 0.0002) {
        totalDistKm += d2d;
      }

      if (dtSecs && dtSecs > 0 && dtSecs < 600) {
        if (speedKmh === null || (speedKmh >= 0.3 && speedKmh <= 120)) {
          movingDurationSecs += dtSecs;
        }
      }

      if (pt.ele !== undefined && prev.ele !== undefined) {
        const diff = pt.ele - prev.ele;
        if (diff > 1.2) {
          calculatedGain += diff;
        } else if (diff < -1.2) {
          calculatedLoss += Math.abs(diff);
        }
      }
    }
    if (pt.ele !== undefined && !isNaN(pt.ele)) {
      if (pt.ele < minEle) minEle = pt.ele;
      if (pt.ele > maxEle) {
        maxEle = pt.ele;
        highestPoint = pt;
      }
    }
    points.push({
      lat: pt.lat,
      lng: pt.lng,
      ele: pt.ele !== undefined ? Math.round(pt.ele) : undefined,
      time: pt.time,
      distFromStartKm: Math.round(totalDistKm * 100) / 100,
    });
  }

  // Check if Garmin or Strava embedded odometer distance is available on last point
  const lastRaw = raw[raw.length - 1];
  if (lastRaw?.embeddedDistM && lastRaw.embeddedDistM > 50) {
    const garminKm = lastRaw.embeddedDistM / 1000;
    if (Math.abs(garminKm - totalDistKm) / Math.max(1, totalDistKm) < 0.25) {
      totalDistKm = garminKm;
    }
  }

  // Calculate Duration
  let totalElapsedSecs = 0;
  if (firstTimestamp && lastTimestamp) {
    totalElapsedSecs = Math.max(0, (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000);
  }

  let finalTotalSecs = 0;
  let finalMovingSecs = 0;

  if (totalElapsedSecs >= 60) {
    finalTotalSecs = totalElapsedSecs;
  } else if (movingDurationSecs >= 60) {
    finalTotalSecs = movingDurationSecs;
  } else {
    // Naismith's hiking rule
    finalTotalSecs = Math.max(1800, Math.round((totalDistKm / 4.0 + calculatedGain / 600.0) * 3600));
  }

  if (movingDurationSecs >= 60) {
    finalMovingSecs = movingDurationSecs;
  }

  const formatSecs = (s: number) => {
    const hours = Math.floor(s / 3600);
    const mins = Math.round((s % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins.toString().padStart(2, '0')}m` : `${mins}m`;
  };

  const formattedDuration = formatSecs(finalTotalSecs);
  const formattedMovingDuration =
    finalMovingSecs >= 60 && Math.abs(finalMovingSecs - finalTotalSecs) >= 60
      ? formatSecs(finalMovingSecs)
      : undefined;

  const nameMatch = /<name>([^<]+)<\/name>/i.exec(xmlString);
  const name = nameMatch ? nameMatch[1].trim() : undefined;

  const metaTimeMatch = /<metadata>[\s\S]*?<time>([^<]+)<\/time>/i.exec(xmlString);
  let activityDate = firstTimestamp ? firstTimestamp.toISOString().split('T')[0] : undefined;
  if (!activityDate && metaTimeMatch) {
    const md = new Date(metaTimeMatch[1].trim());
    if (!isNaN(md.getTime())) {
      activityDate = md.toISOString().split('T')[0];
    }
  }

  return {
    name,
    trackPoints: points,
    totalDistKm: Math.round(totalDistKm * 10) / 10,
    gainM: Math.round(calculatedGain),
    lossM: Math.round(calculatedLoss),
    duration: formattedDuration,
    movingDuration: formattedMovingDuration,
    durationMinutes: Math.round(finalTotalSecs / 60),
    movingDurationMinutes: finalMovingSecs ? Math.round(finalMovingSecs / 60) : undefined,
    date: activityDate,
    minEle: minEle === Number.POSITIVE_INFINITY ? undefined : Math.round(minEle),
    maxEle: maxEle === Number.NEGATIVE_INFINITY ? undefined : Math.round(maxEle),
    highestPoint: highestPoint || { lat: 50.736, lng: 15.74 },
  };
}

// Mountain and regional area detector from GPS coordinates
function detectRangeFromCoords(lat: number, lng: number): string {
  return detectMountainRangeFromCoords(lat, lng);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON (allow larger payloads for GPX XML data)
  app.use(express.json({ limit: '25mb' }));

  // URL normalization: if client script has APP_URL="https://.../?key=1234"
  // then requests to f"{APP_URL}/api/routes" become "/?key=1234/api/routes".
  // This middleware cleanly extracts the /api/routes path so it never returns 404.
  app.use((req, res, next) => {
    if (req.url.includes('/api/routes')) {
      const idx = req.url.indexOf('/api/routes');
      req.url = req.url.slice(idx);
    }
    next();
  });

  // Initialize Firestore database on server
  let db: any = null;
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const fbApp = !getApps().length ? initializeApp(cfg) : getApp();
      db = cfg.firestoreDatabaseId ? getFirestore(fbApp, cfg.firestoreDatabaseId) : getFirestore(fbApp);
      console.log('Firebase Firestore inicializován na serveru pro:', cfg.firestoreDatabaseId || cfg.projectId);
    }
  } catch (err) {
    console.warn('Nepodařilo se inicializovat Firestore na serveru:', err);
  }

  // Initialize Gemini Client (server-side only)
  const geminiApiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (geminiApiKey) {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // 1. AI Gemini endpoint: Rewrite Hike Notes into Witty/Readable Story & Generate Tips
  app.post('/api/gemini/generate-hike-tips', async (req, res) => {
    try {
      const {
        mountainName,
        mountainRange,
        difficulty,
        distanceKm,
        elevationGainM,
        duration,
        weather,
        rawNotes,
        tone,
        locationCoords,
      } = req.body;

      if (!mountainName && !mountainRange && !rawNotes) {
        return res.status(400).json({
          error: 'Zadejte alespoň název aktivity nebo vaše poznámky z cesty.',
        });
      }

      if (!ai) {
        // Return helpful message if GEMINI_API_KEY is not configured
        return res.status(503).json({
          error: 'GEMINI_API_KEY není nastaven na serveru.',
          fallbackRequired: true,
        });
      }

      const userNotesClean = (rawNotes || '').trim();
      const coordsInfo = locationCoords?.lat && locationCoords?.lng
        ? `GPS souřadnice lokality: ${locationCoords.lat.toFixed(4)}° s.š., ${locationCoords.lng.toFixed(4)}° v.d.`
        : '';

      const prompt = `Jsi inteligentní, přirozený a bystrý outdoorový parťák pro osobní turistický deník.
Píšeš z pohledu účastníka výpravy v 1. osobě (já nebo my – např. „vyrazili jsme“, „cesta parádně utíkala“, „nohy už ke konci trochu bolely“, „zastavili jsme se na skvělé kafe a pivo“). Text musí znít jako autentický, neškrobený zápis ze zážitků.

VSTUPNÍ ÚDAJE OD UŽIVATELE:
- Hrubé poznámky a postřehy uživatele:
"""
${userNotesClean || '(Uživatel nezadal textové poznámky – popiš průběh a atmosféru podle lokality a parametrů trasy)'}
"""
- Lokalita a kontext: ${mountainRange || 'Česká republika'}${mountainName ? ` (cíl/oblast: ${mountainName})` : ''}
${coordsInfo ? `- ${coordsInfo}` : ''}
- Parametry trasy:
  * Délka: ${distanceKm ? `${distanceKm} km` : 'neuvedeno'}
  * Nastoupané metry: ${elevationGainM ? `+${elevationGainM} m` : 'neuvedeno'}
  * Čas na trase / doba chůze: ${duration || 'neuvedeno'}
  * Náročnost: ${difficulty || 'střední'} (možné: lehká, střední, těžká, ferrata)
  * Počasí a podmínky: ${weather || 'příjemné outdoorové'}
- Požadovaný styl vyprávění: ${tone === 'adventurous' ? 'svižný a dobrodružný' : tone === 'witty' ? 'odlehčený, vtipný s přirozeným nadhledem' : 'stručný, trefný, čtivý a autentický'}

ZÁVAZNÁ PRAVIDLA PRO VYGENEROVANÝ TEXT (PŘÍSNĚ DODRŽ):
1. ZÁKAZ MECHANICKÉHO OPAKOVÁNÍ NÁZVU VÝPRAVY:
   - NIKDY nezačínej text názvem výpravy ani frázemi typu „Výprava do...“, „Výlet na...“, „Návštěva...“, „[Název] jsme prozkoumali...“, „Naše cesta do...“!
   - Uživatel má název výpravy už v záhlaví své aktivity. Znovu ho uvádět na začátku popisu působí jako robotický, levný generátor.
   - Začni přímo vtažením do děje, počasím, atmosférou nebo konkrétní první myšlenkou z poznámek (např. „Vyrazili jsme za slunečného dopoledne...“, „Trasa od prvních metrů příjemně ubíhala...“, „Procházka historickým centrem stála za to...“).
2. DŮSLEDNÁ OPRAVA PŘEKLEPŮ, GRAMATIKY A DIAKRITIKY:
   - Uživatelské poznámky bývají psané narychlo, s překlepy, bez diakritiky nebo s chybami (např. „byli sme v zamku, pak kafe na naměstí a vyborny pivo u klastera, pekna prochaska“).
   - VŠECHNY tyto chyby inteligentně oprav do čisté, přirozené a čtivé češtiny (např. „byli jsme“, „zámek“, „výborné pivo u kláštera“, „náměstí“).
   - Zachovej původní smysl a zážitky uživatele (co viděl, co pil, co jedl, jak se cítil), ale přeformuluj je do hladkého a přirozeného textu.
3. CHYTRÁ SYNTÉZA PARAMETRŮ (DÉLKA, PŘEVÝŠENÍ, ČAS, POČASÍ):
   - Chytře propoj poznámky s reálnými čísly:
     * Malé převýšení a kratší čas (např. 8 km za 2h s +100 m) = lehká, pohodová procházka, nohy nebolely, čas na památky, kávu a klid.
     * Velké převýšení a dlouhý čas (např. 20 km za 6h s +1100 m) = poctivý horský záhul, těžké nohy, zasloužená odměna v cíli.
4. REÁLIE MÍSTA:
   - Pro města, památky a roviny (např. Litomyšl, zámky, parky, Polabí, Pálava atd.) NIKDY nevymýšlej horské stezky, hřebeny ani alpské štíty. Piš o památkách, uličkách, architektuře, kavárnách a mírném okolí.
   - Pro hory (Krkonoše, Jeseníky, Šumava, Tatry) použij horskou terminologii (hřeben, výhledy, horská chata, stoupání).
5. STRUKTURA A DÉLKA:
   - "story": Přesně 2 až 4 svižné, čtivé a propojené věty v jednom odstavci. Žádný dlouhý balast ani prázdná klišé.
   - "oneLiner": Krátká, trefná a vtipná pointa na jeden řádek vystihující celou akci (opět bez otrockého opakování názvu).
6. REALISTICKÁ DOPORUČENÍ:
   - "highlights": Reálná zajímavá místa v dané lokalitě.
   - "gear": Reálná výbava podle typu akce (pro město/procházku: pohodlné boty, fotoaparát, platební karta; pro hory: pohorky, větrovka atd.).
   - "safety": Reálná bezpečnostní doporučení vhodná pro daný terén.

Odpověz výhradně ve formátu JSON s těmito poli v češtině:
{
  "story": "Hotový přepsaný čtivý text věrný poznámkám a konkrétnímu místu (2-4 věty)...",
  "oneLiner": "Krátká trefná hláška nebo pointa vystihující tuto konkrétní aktivitu.",
  "safety": "Klíčová bezpečnostní doporučení vhodná pro tento konkrétní terén.",
  "highlights": "Zajímavá a reálná místa v dané lokalitě.",
  "gear": ["položka 1", "položka 2", "položka 3", "položka 4"],
  "bestSeason": "Doporučené měsíce či roční období.",
  "weatherTips": "Praktické rady k počasí pro tento typ výletu."
}`;

      // Try modern high-performing Gemini models in priority order
      const modelsToTry = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
      let responseText: string | null = null;
      let lastErr: any = null;

      for (const m of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  story: { type: Type.STRING },
                  oneLiner: { type: Type.STRING },
                  safety: { type: Type.STRING },
                  highlights: { type: Type.STRING },
                  gear: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  bestSeason: { type: Type.STRING },
                  weatherTips: { type: Type.STRING },
                },
                required: ['story', 'oneLiner', 'safety', 'highlights', 'gear', 'bestSeason', 'weatherTips'],
              },
            },
          });
          if (response.text) {
            responseText = response.text;
            console.log(`[Gemini API] Úspěšně vygenerováno pomocí modelu: ${m}`);
            break;
          }
        } catch (mErr: any) {
          console.warn(`[Gemini API] Model ${m} selhal:`, mErr?.message || mErr);
          lastErr = mErr;
        }
      }

      if (!responseText) {
        throw new Error(lastErr?.message || 'Prázdná odpověď od Gemini modelů');
      }

      const parsedData = JSON.parse(responseText.trim());
      return res.json({
        success: true,
        data: {
          ...parsedData,
          rawNotesOriginal: rawNotes,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error('Chyba při volání Gemini API:', err);
      return res.status(500).json({
        error: err.message || 'Chyba při komunikaci s AI asistentem.',
        fallbackRequired: true,
      });
    }
  });

  // 2. Telegram Webhook endpoint
  // Allows receiving notifications / bot webhooks from Telegram
  app.post('/api/telegram/webhook', async (req, res) => {
    const update = req.body;
    console.log('Přijata Telegram aktualizace:', JSON.stringify(update));

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    // Handle incoming document (e.g. GPX track file from user in Telegram)
    if (update?.message?.document) {
      const doc = update.message.document;
      const fileName = doc.file_name || 'track.gpx';
      const fileId = doc.file_id;
      const fromUser = update.message.from?.first_name || 'Uživatel';

      console.log(`Telegram bot přijal dokument: ${fileName} (id: ${fileId}) od ${fromUser}`);

      // If TELEGRAM_BOT_TOKEN is set, construct the direct download url
      let directDownloadUrl = '';
      if (process.env.TELEGRAM_BOT_TOKEN) {
        try {
          const fileResp = await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
          );
          const fileData: any = await fileResp.json();
          if (fileData.ok && fileData.result?.file_path) {
            directDownloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
          }
        } catch (e) {
          console.warn('Nepodařilo se získat file path z Telegram API:', e);
        }
      }

      const openLink = directDownloadUrl
        ? `${baseUrl}/?key=1234&gpxUrl=${encodeURIComponent(directDownloadUrl)}`
        : `${baseUrl}/?key=1234&action=new&name=${encodeURIComponent(fileName.replace(/\.gpx$/i, ''))}`;

      return res.json({
        ok: true,
        message: 'GPX dokument byl přijat.',
        fileName,
        openLink,
        instructions: `Pro otevření a uložení trasy v Deníku klikněte na: ${openLink}`,
      });
    }

    // Handle bot message
    if (update?.message?.text) {
      const text: string = update.message.text;
      const fromUser = update.message.from?.username || update.message.from?.first_name || 'Uživatel';
      const isHike = text.startsWith('/tura') || text.startsWith('/hike');

      let openLink = `${baseUrl}/?key=1234`;
      if (isHike) {
        const cleaned = text.replace(/^\/(tura|hike)\s*/i, '');
        const parts = cleaned.split('|').map((s) => s.trim());
        const title = parts[0] || 'Nová túra z Telegramu';
        openLink += `&action=new&title=${encodeURIComponent(title)}`;
      }

      return res.json({
        ok: true,
        received: {
          text,
          from: fromUser,
          parsedHikeCandidate: isHike,
          openLink,
        },
      });
    }

    res.json({ ok: true, message: 'Webhook přijat.' });
  });

  // 3. GPX Proxy to safely fetch GPX tracks from external links without CORS restrictions
  app.get('/api/gpx-proxy', async (req, res) => {
    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      return res.status(400).json({ error: 'Chybí parametr url' });
    }

    try {
      const decodedUrl = decodeURIComponent(rawUrl);
      console.log('Stahuji GPX přes proxy z:', decodedUrl);
      const response = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Horsky-Denik-App/1.0',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Nepodařilo se stáhnout GPX soubor (HTTP ${response.status})`,
        });
      }

      const gpxText = await response.text();
      res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
      return res.send(gpxText);
    } catch (err: any) {
      console.error('Chyba při stahování GPX přes proxy:', err);
      return res.status(500).json({ error: err.message || 'Chyba při stahování GPX' });
    }
  });

  // 4. Telegram Simulator / Test message endpoint
  app.post('/api/telegram/test-send', (req, res) => {
    const { message, key } = req.body;
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    let directUrl = `${baseUrl}/?key=${key || '1234'}`;
    if (message.startsWith('/tura') || message.startsWith('/hike')) {
      const cleaned = message.replace(/^\/(tura|hike)\s*/i, '');
      const parts = cleaned.split('|').map((s: string) => s.trim());
      const title = parts[0] || 'Nová výprava';
      directUrl += `&action=new&title=${encodeURIComponent(title)}`;
    }

    res.json({
      ok: true,
      simulatedResponse: `Zpráva "${message}" byla úspěšně zpracována botem Horský Deník.`,
      authorized: true,
      openLink: directUrl,
    });
  });

  // 5. Garmin Integration API: Receive uploaded routes from Python script
  // Handles requests from upload_to_hiking_diary:
  // POST /api/routes { title, date, distanceKm, elevationGainM, elevationLossM, durationMinutes, gpxXml, description, ... }
  app.post('/api/routes', async (req, res) => {
    try {
      const {
        title,
        date,
        distanceKm,
        elevationGainM,
        elevationLossM,
        durationMinutes,
        gpxXml,
        description,
        wantToVisitAgain,
        id,
        activityType,
        difficulty: reqDifficulty,
      } = req.body;

      console.log(`[API /api/routes] Přijata nová trasa z Garminu: "${title || 'Bez názvu'}" (${distanceKm} km)`);

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const baseUrl = `${protocol}://${host}`;

      let parsedGpx: any = null;
      if (gpxXml && typeof gpxXml === 'string') {
        try {
          parsedGpx = parseServerGpx(gpxXml);
        } catch (e) {
          console.warn('[API /api/routes] Varování při parsování GPX:', e);
        }
      }

      const routeId = id || `hike-garmin-${Date.now()}`;
      const finalTitle = title || parsedGpx?.name || 'Aktivita z Garminu';
      const finalDistance = Number(distanceKm) || parsedGpx?.totalDistKm || 5;
      const finalGain = Number(elevationGainM) || parsedGpx?.gainM || 100;
      const finalLoss = Number(elevationLossM) || parsedGpx?.lossM || finalGain;

      // Format duration
      let formattedDuration = parsedGpx?.duration || '1h 30m';
      let formattedMovingDuration = parsedGpx?.movingDuration;
      if (durationMinutes && !isNaN(Number(durationMinutes))) {
        const mins = Math.round(Number(durationMinutes));
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        formattedDuration = `${hours}h ${remMins < 10 ? '0' : ''}${remMins}m`;
      }
      if (req.body.duration && typeof req.body.duration === 'string') {
        formattedDuration = req.body.duration.trim();
      }
      if (req.body.movingDuration && typeof req.body.movingDuration === 'string') {
        formattedMovingDuration = req.body.movingDuration.trim();
      }

      // Peak coordinates & mountain range
      const peakLat = parsedGpx?.highestPoint?.lat || 50.736;
      const peakLng = parsedGpx?.highestPoint?.lng || 15.74;
      const detectedRange = detectRangeFromCoords(peakLat, peakLng);

      const isMountaineering =
        (activityType && /climb|mountaineer|lezen|skal/i.test(String(activityType))) ||
        (finalTitle && /lezení|horolezectví|climbing|mountaineering|boulder/i.test(finalTitle));

      const determinedActivityType = isMountaineering
        ? 'mountaineering'
        : activityType
        ? String(activityType).trim().toLowerCase()
        : undefined;

      const candidateRange = typeof req.body.mountainRange === 'string' ? req.body.mountainRange.trim() : '';
      const finalRange =
        candidateRange && !isSuspectMountainRange(candidateRange, peakLat, peakLng)
          ? candidateRange
          : detectedRange;

      const newHike = {
        id: routeId,
        title: finalTitle,
        mountainRange: finalRange,
        activityType: determinedActivityType,
        date: date ? String(date).slice(0, 10) : (parsedGpx?.date || new Date().toISOString().split('T')[0]),
        distanceKm: Math.round(finalDistance * 10) / 10,
        elevationGainM: Math.round(finalGain),
        elevationLossM: Math.round(finalLoss),
        duration: formattedDuration,
        movingDuration: formattedMovingDuration,
        difficulty: reqDifficulty || (isMountaineering ? 'climbing' : (finalGain > 0 || finalDistance > 0)
          ? (finalGain >= 1000 || finalDistance >= 22 ? 'hard' : (finalGain <= 350 && finalDistance <= 10 ? 'easy' : 'moderate'))
          : undefined),
        rating: undefined,
        description:
          description ||
          'Nová aktivita z Garminu. Klikněte pro doplnění zážitků a fotek.',
        photos: [],
        highestPointM: parsedGpx?.maxEle,
        lowestPointM: parsedGpx?.minEle,
        peakCoords: {
          lat: peakLat,
          lng: peakLng,
          name: finalTitle,
        },
        trackPoints: parsedGpx?.trackPoints?.length ? parsedGpx.trackPoints : undefined,
        gpxRawXml: gpxXml || undefined,
      };

      // Save to Firestore if available
      if (db) {
        try {
          await setDoc(doc(db, 'hikes', routeId), newHike);
          console.log(`[API /api/routes] Trasa ${routeId} úspěšně uložena do Firestore.`);
        } catch (dbErr) {
          console.warn('[API /api/routes] Chyba při zápisu do Firestore:', dbErr);
        }
      }

      // Return structure expected by Garmin python script: r.json().get("route", {}).get("id")
      return res.status(201).json({
        success: true,
        route: newHike,
        message: 'Túra úspěšně uložena do Horského deníku.',
        openUrl: `${baseUrl}/?key=1234&edit=${routeId}`,
      });
    } catch (err: any) {
      console.error('[API /api/routes] Selhalo zpracování trasy:', err);
      return res.status(500).json({
        error: err.message || 'Chyba při ukládání trasy',
      });
    }
  });

  // GET /api/routes: List all routes
  app.get('/api/routes', async (req, res) => {
    try {
      if (!db) {
        return res.json({ routes: [] });
      }
      const snapshot = await getDocs(collection(db, 'hikes'));
      const routes: any[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        routes.push({
          ...data,
          id: (data.id && String(data.id).trim()) || d.id,
        });
      });
      return res.json({ routes });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/routes/:id: Get route by id
  app.get('/api/routes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!db) {
        return res.status(404).json({ error: 'Firestore není připojen' });
      }
      const snap = await getDoc(doc(db, 'hikes', id));
      if (!snap.exists()) {
        return res.status(404).json({ error: 'Trasa nenalezena' });
      }
      const data = snap.data() as any;
      return res.json({ route: { ...data, id: data.id || snap.id } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/routes/reassign-ranges: Re-evaluates mountain ranges from GPS coordinates
  app.post('/api/routes/reassign-ranges', async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: 'Firestore není připojen' });
      }

      const { forceAll, fixSuspectOnly = true } = req.body || {};
      const snapshot = await getDocs(collection(db, 'hikes'));
      const updatedRoutes: Array<{
        id: string;
        title: string;
        oldRange: string;
        newRange: string;
        lat?: number;
        lng?: number;
      }> = [];

      for (const d of snapshot.docs) {
        const data = d.data() as any;
        const currentRange = (data.mountainRange && String(data.mountainRange).trim()) || '';
        let lat: number | undefined = data.peakCoords?.lat;
        let lng: number | undefined = data.peakCoords?.lng;

        // If no peakCoords, look at trackPoints
        if ((!lat || !lng) && data.trackPoints && data.trackPoints.length > 0) {
          const pts = data.trackPoints;
          let sumLat = 0;
          let sumLng = 0;
          pts.forEach((p: any) => {
            sumLat += p.lat;
            sumLng += p.lng;
          });
          lat = sumLat / pts.length;
          lng = sumLng / pts.length;
        }

        if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
          const detected = detectMountainRangeFromCoords(lat, lng);
          const isPoland = currentRange.toLowerCase() === 'polsko';
          const isSuspect = isPoland || !currentRange || currentRange === 'Aktivita v terénu';

          const shouldUpdate =
            (forceAll && detected !== currentRange) ||
            (fixSuspectOnly && isSuspect && detected !== currentRange) ||
            (isPoland && detected !== 'Polsko');

          if (shouldUpdate && detected) {
            await updateDoc(d.ref, { mountainRange: detected });
            updatedRoutes.push({
              id: d.id,
              title: data.title || 'Bez názvu',
              oldRange: currentRange,
              newRange: detected,
              lat,
              lng,
            });
          }
        }
      }

      console.log(`[API /api/routes/reassign-ranges] Úspěšně opraveno ${updatedRoutes.length} tras.`);
      return res.json({
        success: true,
        updatedCount: updatedRoutes.length,
        updatedRoutes,
      });
    } catch (err: any) {
      console.error('[API /api/routes/reassign-ranges] Chyba při přehodnocení pohoří:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/routes/batch-rename-range: Bulk rename a mountain range
  app.post('/api/routes/batch-rename-range', async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: 'Firestore není připojen' });
      }

      const { fromRange, toRange } = req.body || {};
      if (!fromRange || !toRange || !fromRange.trim() || !toRange.trim()) {
        return res.status(400).json({ error: 'Zadejte původní i nové pohoří.' });
      }

      const cleanFrom = fromRange.trim();
      const cleanTo = toRange.trim();
      const snapshot = await getDocs(collection(db, 'hikes'));
      let count = 0;

      for (const d of snapshot.docs) {
        const data = d.data() as any;
        if (data.mountainRange === cleanFrom) {
          await updateDoc(d.ref, { mountainRange: cleanTo });
          count++;
        }
      }

      console.log(`[API /api/routes/batch-rename-range] Přejmenováno ${count} tras z "${cleanFrom}" na "${cleanTo}".`);
      return res.json({
        success: true,
        updatedCount: count,
        fromRange: cleanFrom,
        toRange: cleanTo,
      });
    } catch (err: any) {
      console.error('[API /api/routes/batch-rename-range] Chyba při hromadném přejmenování:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/routes: Delete all routes from Firestore
  app.delete('/api/routes', async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: 'Firestore není připojen' });
      }
      const snapshot = await getDocs(collection(db, 'hikes'));
      const deletedIds: string[] = [];
      for (const d of snapshot.docs) {
        await deleteDoc(d.ref);
        deletedIds.push(d.id);
      }
      console.log(`[API /api/routes] Hromadně smazáno ${deletedIds.length} tras z Firestore.`);
      return res.json({ success: true, count: deletedIds.length, deletedIds });
    } catch (err: any) {
      console.error('[API /api/routes] Chyba při hromadném mazání:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/routes/:id: Delete route by id
  app.delete('/api/routes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || !id.trim() || id === 'undefined' || id === 'null') {
        return res.status(400).json({ error: 'Neplatné ID trasy' });
      }
      if (db) {
        await deleteDoc(doc(db, 'hikes', id.trim()));
        console.log(`[API /api/routes] Trasa ${id} úspěšně smazána z Firestore serverem.`);
      }
      return res.json({ success: true, message: `Trasa ${id} byla smazána.` });
    } catch (err: any) {
      console.warn(`[API /api/routes] Chyba při mazání trasy ${req.params.id}:`, err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for dev or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Horský Deník server běží na http://0.0.0.0:${PORT}`);
  });
}

startServer();
