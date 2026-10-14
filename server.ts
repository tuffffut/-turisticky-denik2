import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { detectMountainRangeFromCoords, isSuspectMountainRange } from './src/utils/mountainRanges';
import ExifReader from 'exifreader';

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

// Server-side GPX track parser (universal: handles self-closing tags, arbitrary attribute order, namespaces)
function parseServerGpx(xmlString: string) {
  const points: { lat: number; lng: number; ele?: number; time?: string; distFromStartKm?: number }[] = [];
  const raw: { lat: number; lng: number; ele?: number; time?: string; timestampMs?: number; embeddedDistM?: number }[] = [];
  let firstTimestamp: Date | null = null;
  let lastTimestamp: Date | null = null;

  // Universal match for any track/route/way point tag: open with inner content OR self-closing
  const pointTagRegex = /<(?:[a-zA-Z0-9_-]+:)?(?:trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?(?:trkpt|rtept|wpt)>)/gi;
  let match;

  while ((match = pointTagRegex.exec(xmlString)) !== null) {
    const attrs = match[1] || '';
    const inner = match[2] || '';

    const latMatch = /\blat=["']([^"']+)["']/i.exec(attrs);
    const lonMatch = /\b(?:lon|lng)=["']([^"']+)["']/i.exec(attrs);

    if (!latMatch || !lonMatch) continue;
    const lat = parseFloat(latMatch[1]);
    const lng = parseFloat(lonMatch[1]);

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

  // Middleware for parsing JSON & URL-encoded (support 4K/high-res photo uploads and GPX data)
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // URL normalization: if client script has APP_URL="https://.../?key=1234"
  // then requests to f"{APP_URL}/api/routes" become "/?key=1234/api/routes".
  // This middleware cleanly extracts the /api/routes path so it never returns 404.
  app.use((req, res, next) => {
    if (req.url.includes('/api/routes')) {
      const idx = req.url.indexOf('/api/routes');
      req.url = req.url.slice(idx);
    } else if (req.url.includes('/api/hikes')) {
      const idx = req.url.indexOf('/api/hikes');
      req.url = req.url.slice(idx);
    }
    next();
  });

  // Strict anti-caching middleware for dynamic API routes and HTML documents
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/' || req.path.endsWith('.html')) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
      });
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

  // Local storage paths for instant caching and quota resilience
  const dataDir = path.join(process.cwd(), 'data');
  const photosDir = path.join(dataDir, 'photos');
  const routesCachePath = path.join(dataDir, 'routes-cache.json');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  function getLocalRoutes(): any[] {
    try {
      if (fs.existsSync(routesCachePath)) {
        const text = fs.readFileSync(routesCachePath, 'utf8');
        return JSON.parse(text);
      }
    } catch (e) {
      console.warn('Nelze přečíst routes-cache.json:', e);
    }
    return [];
  }

  function saveLocalRoutes(routes: any[]) {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(routesCachePath, JSON.stringify(routes, null, 2));
    } catch (e) {
      console.warn('Nelze uložit routes-cache.json:', e);
    }
  }

  // Security & Access PIN configuration
  const securityConfigPath = path.join(dataDir, 'security.json');
  function getSecurityPin(): string {
    try {
      if (fs.existsSync(securityConfigPath)) {
        const text = fs.readFileSync(securityConfigPath, 'utf8');
        const json = JSON.parse(text);
        if (json.pin && typeof json.pin === 'string' && json.pin.trim()) {
          return json.pin.trim();
        }
      }
    } catch {}
    return '1234';
  }

  function setSecurityPin(newPin: string) {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(securityConfigPath, JSON.stringify({ pin: newPin.trim() }, null, 2));
      if (db) {
        setDoc(doc(db, 'settings', 'security'), { pin: newPin.trim() }, { merge: true }).catch(() => {});
      }
    } catch (e) {
      console.warn('Nelze uložit security PIN:', e);
    }
  }

  // Robust photo storage helper: Saves photo dataUrl to disk and Firestore hike_photos
  // Returns lean HikePhotoItem metadata object with permanent /api/photos/:id URL
  async function savePhotoDataUrl(
    dataUrl: string,
    hikeId = '',
    meta: { name?: string; caption?: string; width?: number; height?: number; sizeKb?: number } = {}
  ): Promise<any> {
    const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const name = meta.name || 'foto.jpg';
    const caption = meta.caption || '';
    let width = meta.width;
    let height = meta.height;
    let sizeKb = meta.sizeKb;

    // 1. Save binary file and json metadata directly to disk for 0ms local retrieval
    try {
      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], 'base64');
        fs.writeFileSync(path.join(photosDir, `${photoId}.bin`), buffer);
        if (!sizeKb) {
          sizeKb = Math.round(buffer.length / 1024);
        }
        if (!width || !height) {
          try {
            const tags = ExifReader.load(buffer);
            const w = tags['Image Width']?.value;
            const h = tags['Image Height']?.value;
            if (w && h) {
              width = Number(w);
              height = Number(h);
            }
          } catch (e) {
            // Ignore if tags cannot be parsed
          }
        }
      }
      fs.writeFileSync(
        path.join(photosDir, `${photoId}.json`),
        JSON.stringify({
          id: photoId,
          hikeId: hikeId || '',
          dataUrl,
          name,
          caption,
          width: width || null,
          height: height || null,
          sizeKb: sizeKb || null,
          createdAt: new Date().toISOString(),
        })
      );
      console.log(`[savePhotoDataUrl] Fotografie ${photoId} uložena na disk (${sizeKb} KB).`);
    } catch (fsErr) {
      console.warn('Nelze uložit fotku na disk:', fsErr);
    }

    // 2. Save to Firestore hike_photos collection (with chunking if needed)
    if (db) {
      try {
        const CHUNK_SIZE = 700 * 1024;
        if (dataUrl.length <= CHUNK_SIZE) {
          await setDoc(doc(db, 'hike_photos', photoId), {
            id: photoId,
            hikeId: hikeId || '',
            dataUrl,
            name,
            caption,
            width: width || null,
            height: height || null,
            sizeKb: sizeKb || null,
            isChunked: false,
            createdAt: new Date().toISOString(),
          });
        } else {
          const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);
          await setDoc(doc(db, 'hike_photos', photoId), {
            id: photoId,
            hikeId: hikeId || '',
            dataUrlChunk0: dataUrl.substring(0, CHUNK_SIZE),
            totalChunks,
            isChunked: true,
            name,
            caption,
            width: width || null,
            height: height || null,
            sizeKb: sizeKb || null,
            createdAt: new Date().toISOString(),
          });
          for (let i = 1; i < totalChunks; i++) {
            const chunkStr = dataUrl.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            await setDoc(doc(db, `hike_photos/${photoId}/chunks`, `chunk_${i}`), {
              chunkIndex: i,
              data: chunkStr,
            });
          }
        }
        console.log(`[savePhotoDataUrl] Fotografie ${photoId} uložena do Firestore.`);
      } catch (dbErr: any) {
        console.warn('[savePhotoDataUrl] Chyba při zápisu do Firestore:', dbErr.message);
      }
    }

    return {
      id: photoId,
      url: `/api/photos/${photoId}`,
      rawUrl: `/api/photos/${photoId}?raw=1`,
      name,
      caption,
      width: width || null,
      height: height || null,
      sizeKb: sizeKb || null,
      source: 'user',
      createdAt: new Date().toISOString(),
    };
  }

  // Helper to migrate legacy inline base64 photos in Firestore to standalone /api/photos/:id
  async function migrateLegacyPhotos() {
    if (!db) return;
    try {
      const snap = await getDocs(collection(db, 'hikes'));
      let migratedCount = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (Array.isArray(data.photos) && data.photos.length > 0) {
          let hasBase64 = false;
          for (const p of data.photos) {
            if (typeof p === 'string' && p.startsWith('data:')) {
              hasBase64 = true;
              break;
            }
            if (typeof p === 'object' && p !== null) {
              if ((p.dataUrl && p.dataUrl.startsWith('data:')) || (p.url && p.url.startsWith('data:'))) {
                hasBase64 = true;
                break;
              }
            }
          }
          if (hasBase64) {
            console.log(`[Migrace fotek] Migruji inline fotky pro trasu ${d.id} ("${data.title}")...`);
            const cleanPhotos: any[] = [];
            for (let i = 0; i < data.photos.length; i++) {
              const p = data.photos[i];
              if (typeof p === 'string') {
                if (p.startsWith('data:')) {
                  const saved = await savePhotoDataUrl(p, d.id, { name: `foto_${i + 1}.jpg` });
                  cleanPhotos.push(saved);
                } else {
                  cleanPhotos.push(p);
                }
              } else if (typeof p === 'object' && p !== null) {
                const pObj = { ...p };
                const b64 = (pObj.dataUrl && pObj.dataUrl.startsWith('data:'))
                  ? pObj.dataUrl
                  : (pObj.url && pObj.url.startsWith('data:'))
                  ? pObj.url
                  : null;
                if (b64) {
                  const saved = await savePhotoDataUrl(b64, d.id, {
                    name: pObj.name || `foto_${i + 1}.jpg`,
                    caption: pObj.caption || '',
                    width: pObj.width,
                    height: pObj.height,
                    sizeKb: pObj.sizeKb,
                  });
                  cleanPhotos.push({
                    ...pObj,
                    id: pObj.id || saved.id,
                    url: saved.url,
                    rawUrl: saved.rawUrl,
                    dataUrl: undefined,
                  });
                } else {
                  const { dataUrl, ...rest } = pObj;
                  cleanPhotos.push(rest);
                }
              }
            }
            await updateDoc(doc(db, 'hikes', d.id), { photos: cleanPhotos });
            migratedCount++;
          }
        }
      }
      if (migratedCount > 0) {
        console.log(`[Migrace fotek] Úspěšně zmigrováno ${migratedCount} tras s inline fotkami do /api/photos/`);
      }
    } catch (err: any) {
      console.warn('[Migrace fotek] Chyba při migraci:', err.message);
    }
  }

  // Trigger migration in background
  setTimeout(() => {
    migrateLegacyPhotos().catch(err => console.warn('Migrace fotek selhala:', err));
  }, 1000);

  // 5. Garmin Integration API: Receive uploaded routes from Python script
  // Handles requests from upload_to_hiking_diary:
  // POST /api/routes or /api/hikes { title, date, distanceKm, elevationGainM, elevationLossM, durationMinutes, gpxXml, description, ... }
  const handleSaveRoute = async (req: express.Request, res: express.Response) => {
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

      const routeId = (id && String(id).trim()) || `hike-garmin-${Date.now()}`;
      console.log(`[API /api/routes] Zpracovávám trasu ${routeId}: "${title || ''}"`);

      // 1. Fetch existing route data if updating
      let existingData: any = null;
      if (db) {
        try {
          const existingDocSnap = await getDoc(doc(db, 'hikes', routeId));
          if (existingDocSnap.exists()) {
            existingData = existingDocSnap.data();
          }
        } catch (dbErr: any) {
          console.warn('[API /api/routes] Chyba při čtení existující trasy z Firestore:', dbErr.message);
        }
      }
      if (!existingData) {
        const local = getLocalRoutes();
        existingData = local.find((r: any) => r.id === routeId) || null;
      }

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

      // Title & Metrics
      const finalTitle = title !== undefined && String(title).trim()
        ? String(title).trim()
        : existingData?.title || parsedGpx?.name || 'Aktivita z Garminu';

      const finalDistance = distanceKm !== undefined && !isNaN(Number(distanceKm))
        ? Number(distanceKm)
        : existingData?.distanceKm !== undefined
        ? Number(existingData.distanceKm)
        : (parsedGpx?.totalDistKm || 5);

      const finalGain = elevationGainM !== undefined && !isNaN(Number(elevationGainM))
        ? Number(elevationGainM)
        : existingData?.elevationGainM !== undefined
        ? Number(existingData.elevationGainM)
        : (parsedGpx?.gainM || 100);

      const finalLoss = elevationLossM !== undefined && !isNaN(Number(elevationLossM))
        ? Number(elevationLossM)
        : existingData?.elevationLossM !== undefined
        ? Number(existingData.elevationLossM)
        : (parsedGpx?.lossM || finalGain);

      // Duration
      let formattedDuration = existingData?.duration || parsedGpx?.duration || '1h 30m';
      let formattedMovingDuration = existingData?.movingDuration || parsedGpx?.movingDuration;
      if (durationMinutes && !isNaN(Number(durationMinutes))) {
        const mins = Math.round(Number(durationMinutes));
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        formattedDuration = `${hours}h ${remMins < 10 ? '0' : ''}${remMins}m`;
      }
      if (req.body.duration && typeof req.body.duration === 'string' && req.body.duration.trim()) {
        formattedDuration = req.body.duration.trim();
      }
      if (req.body.movingDuration && typeof req.body.movingDuration === 'string' && req.body.movingDuration.trim()) {
        formattedMovingDuration = req.body.movingDuration.trim();
      }

      // Peak coordinates & mountain range
      const peakLat = req.body.peakCoords?.lat || existingData?.peakCoords?.lat || parsedGpx?.highestPoint?.lat || 50.736;
      const peakLng = req.body.peakCoords?.lng || existingData?.peakCoords?.lng || parsedGpx?.highestPoint?.lng || 15.74;
      const detectedRange = detectRangeFromCoords(peakLat, peakLng);

      const candidateRange = typeof req.body.mountainRange === 'string' && req.body.mountainRange.trim()
        ? req.body.mountainRange.trim()
        : existingData?.mountainRange || '';

      const finalRange = candidateRange && !isSuspectMountainRange(candidateRange, peakLat, peakLng)
        ? candidateRange
        : (candidateRange || detectedRange);

      const isMountaineering =
        (activityType && /climb|mountaineer|lezen|skal/i.test(String(activityType))) ||
        (finalTitle && /lezení|horolezectví|climbing|mountaineering|boulder/i.test(finalTitle));

      const determinedActivityType = isMountaineering
        ? 'mountaineering'
        : (activityType && String(activityType).trim().toLowerCase()) || existingData?.activityType || 'hiking';

      // Trackpoints handling (both trackPoints and trackpoints supported)
      const inputTrackPoints =
        (Array.isArray(req.body.trackpoints) && req.body.trackpoints.length > 0)
          ? req.body.trackpoints
          : (Array.isArray(req.body.trackPoints) && req.body.trackPoints.length > 0)
          ? req.body.trackPoints
          : parsedGpx?.trackPoints?.length
          ? parsedGpx.trackPoints
          : existingData?.trackpoints || existingData?.trackPoints;

      // Photos handling: If photos explicitly passed as array (even empty []), respect user's exact state!
      let finalPhotos: any[] = [];
      if (Array.isArray(req.body.photos)) {
        finalPhotos = req.body.photos;
      } else if (existingData && Array.isArray(existingData.photos)) {
        finalPhotos = existingData.photos;
      }

      // Normalize photos: If any photo has inline base64 string or dataUrl, extract to /api/photos/:id
      const normalizedPhotos: any[] = [];
      for (let i = 0; i < finalPhotos.length; i++) {
        const p = finalPhotos[i];
        if (typeof p === 'string') {
          if (p.startsWith('data:')) {
            const saved = await savePhotoDataUrl(p, routeId, { name: `foto_${i + 1}.jpg` });
            normalizedPhotos.push(saved);
          } else {
            normalizedPhotos.push(p);
          }
        } else if (typeof p === 'object' && p !== null) {
          const pObj = { ...p };
          const b64 = (pObj.dataUrl && typeof pObj.dataUrl === 'string' && pObj.dataUrl.startsWith('data:'))
            ? pObj.dataUrl
            : (pObj.url && typeof pObj.url === 'string' && pObj.url.startsWith('data:'))
            ? pObj.url
            : null;

          if (b64) {
            const saved = await savePhotoDataUrl(b64, routeId, {
              name: pObj.name || `foto_${i + 1}.jpg`,
              caption: pObj.caption || '',
              width: pObj.width,
              height: pObj.height,
              sizeKb: pObj.sizeKb,
            });
            normalizedPhotos.push({
              ...pObj,
              id: pObj.id || saved.id,
              url: saved.url,
              rawUrl: saved.rawUrl,
              dataUrl: undefined,
            });
          } else {
            const { dataUrl, ...rest } = pObj;
            normalizedPhotos.push(rest);
          }
        }
      }

      const newHike: Record<string, any> = {
        ...(existingData || {}),
        id: routeId,
        title: finalTitle,
        mountainRange: finalRange,
        activityType: determinedActivityType,
        date: date ? String(date).slice(0, 10) : (existingData?.date || parsedGpx?.date || new Date().toISOString().split('T')[0]),
        startTime: req.body.startTime !== undefined ? req.body.startTime : existingData?.startTime,
        distanceKm: Math.round(finalDistance * 10) / 10,
        elevationGainM: Math.round(finalGain),
        elevationLossM: Math.round(finalLoss),
        duration: formattedDuration,
        movingDuration: formattedMovingDuration,
        difficulty: reqDifficulty || existingData?.difficulty || (isMountaineering ? 'climbing' : (finalGain > 0 || finalDistance > 0)
          ? (finalGain >= 1000 || finalDistance >= 22 ? 'hard' : (finalGain <= 350 && finalDistance <= 10 ? 'easy' : 'moderate'))
          : undefined),
        description: description !== undefined
          ? description
          : (existingData?.description || 'Nová aktivita z Garminu. Klikněte pro doplnění zážitků a fotek.'),
        photos: normalizedPhotos,
        highestPointM: Number(req.body.highestPointM) || existingData?.highestPointM || parsedGpx?.maxEle || (inputTrackPoints?.length ? Math.max(...inputTrackPoints.map((p: any) => p.ele ?? 0).filter((e: number) => e > 0)) : undefined),
        lowestPointM: Number(req.body.lowestPointM) || existingData?.lowestPointM || parsedGpx?.minEle || (inputTrackPoints?.length ? Math.min(...inputTrackPoints.map((p: any) => p.ele ?? 9999).filter((e: number) => e > 0)) : undefined),
        peakCoords: req.body.peakCoords || existingData?.peakCoords || {
          lat: peakLat,
          lng: peakLng,
          name: finalTitle,
        },
        trackPoints: inputTrackPoints,
        trackpoints: inputTrackPoints,
        gpxRawXml: gpxXml || existingData?.gpxRawXml || undefined,
        garminActivityId: req.body.garminActivityId || req.body.activityId || existingData?.garminActivityId,
        source: req.body.source || existingData?.source || 'garmin',
      };

      // Sanitize: Firestore throws on undefined, so omit any undefined values
      const cleanHikeForDb: Record<string, any> = {};
      for (const [k, v] of Object.entries(newHike)) {
        if (v !== undefined) {
          cleanHikeForDb[k] = v;
        }
      }

      // Save directly to Firestore cloud database
      if (!db) {
        return res.status(503).json({ error: 'Cloudová databáze Firestore není na serveru připojena.' });
      }
      try {
        await setDoc(doc(db, 'hikes', routeId), cleanHikeForDb);
        console.log(`[API /api/routes] Trasa ${routeId} úspěšně uložena do Firestore (fotografií: ${normalizedPhotos.length}).`);
      } catch (dbErr: any) {
        console.error('[API /api/routes] Chyba při zápisu do Firestore:', dbErr);
        return res.status(500).json({ error: 'Chyba při zápisu do cloudové databáze serveru: ' + dbErr.message });
      }

      // Also mirror to local disk
      try {
        const currentRoutes = getLocalRoutes();
        const existingIdx = currentRoutes.findIndex((r: any) => r.id === routeId);
        if (existingIdx >= 0) {
          currentRoutes[existingIdx] = { ...currentRoutes[existingIdx], ...cleanHikeForDb };
        } else {
          currentRoutes.unshift(cleanHikeForDb);
        }
        saveLocalRoutes(currentRoutes);
      } catch (cacheErr) {}

      return res.status(201).json({
        success: true,
        route: cleanHikeForDb,
        message: 'Túra úspěšně uložena do Horského deníku.',
        openUrl: `${baseUrl}/?key=0303&edit=${routeId}`,
      });
    } catch (err: any) {
      console.error('[API /api/routes] Selhalo zpracování trasy:', err);
      return res.status(500).json({
        error: err.message || 'Chyba při ukládání trasy',
      });
    }
  };

  app.post('/api/routes', handleSaveRoute);
  app.post('/api/hikes', handleSaveRoute);

  // GET /api/routes: List all routes directly from central Firestore cloud database
  app.get('/api/routes', async (req, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });
    if (!db) {
      return res.status(503).json({
        error: 'Cloudová databáze Firestore není na serveru připojena.',
        routes: [],
      });
    }
    try {
      const snapshot = await getDocs(collection(db, 'hikes'));
      const routes: any[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        const pts = (Array.isArray(data.trackpoints) && data.trackpoints.length > 0)
          ? data.trackpoints
          : (Array.isArray(data.trackPoints) && data.trackPoints.length > 0)
          ? data.trackPoints
          : [];
        routes.push({
          ...data,
          id: (data.id && String(data.id).trim()) || d.id,
          trackpoints: pts,
          trackPoints: pts,
          photos: Array.isArray(data.photos) ? data.photos : [],
        });
      });
      return res.json({ routes });
    } catch (err: any) {
      console.error('[API /api/routes] Chyba při čtení tras z Firestore serverem:', err);
      return res.status(500).json({
        error: `Chyba při načítání tras z cloudové databáze serveru: ${err.message || 'Neznámá chyba'}`,
        routes: [],
      });
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
          const isSuspect = isSuspectMountainRange(currentRange, lat, lng);

          const shouldUpdate =
            (forceAll && detected !== currentRange) ||
            (fixSuspectOnly && isSuspect && detected !== currentRange) ||
            (isSuspect && detected && detected !== currentRange);

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

  // DELETE /api/routes/:id/photos/:photoId: Directly and permanently delete a photo from a hike
  app.delete('/api/routes/:id/photos/:photoId', async (req, res) => {
    try {
      const { id, photoId } = req.params;
      console.log(`[API /api/routes/:id/photos/:photoId] Trvale odstraňuji fotku ${photoId} z výpravy ${id}`);

      // 1. Delete physical files from disk
      const binPath = path.join(photosDir, `${photoId}.bin`);
      const jsonPath = path.join(photosDir, `${photoId}.json`);
      if (fs.existsSync(binPath)) {
        try { fs.unlinkSync(binPath); } catch {}
      }
      if (fs.existsSync(jsonPath)) {
        try { fs.unlinkSync(jsonPath); } catch {}
      }

      // 2. Delete from Firestore collection hike_photos
      if (db) {
        deleteDoc(doc(db, 'hike_photos', photoId)).catch(() => {});
      }

      // 3. Update route in local routes-cache.json (authoritative immediate storage)
      let updatedPhotos: any[] = [];
      try {
        const local = getLocalRoutes();
        const rIdx = local.findIndex((r: any) => r.id === id);
        if (rIdx >= 0) {
          const currentPhotos = local[rIdx].photos || [];
          updatedPhotos = currentPhotos.filter((p: any) => {
            if (typeof p === 'string') return p !== photoId && !p.includes(photoId);
            if (typeof p === 'object' && p !== null) return p.id !== photoId && p.url !== `/api/photos/${photoId}` && p.rawUrl !== `/api/photos/${photoId}?raw=1`;
            return true;
          });
          local[rIdx].photos = updatedPhotos;
          saveLocalRoutes(local);
          console.log(`[API /api/routes/:id/photos/:photoId] Místní cache pro výpravu ${id} aktualizována (zbývá fotek: ${updatedPhotos.length})`);
        }
      } catch (cacheErr: any) {
        console.warn('[API DELETE photo] Cache chyba:', cacheErr.message);
      }

      // 4. Update route in Firestore in background
      if (db) {
        try {
          await updateDoc(doc(db, 'hikes', id), { photos: updatedPhotos });
          console.log(`[API /api/routes/:id/photos/:photoId] Firestore výprava ${id} aktualizována (zbývá fotek: ${updatedPhotos.length})`);
        } catch (dbErr: any) {
          console.warn('[API DELETE photo] Firestore chyba (nebude blokovat klienta):', dbErr.message);
        }
      }

      return res.json({ success: true, photos: updatedPhotos, message: 'Fotografie byla trvale smazána.' });
    } catch (err: any) {
      console.error('[API DELETE photo] Chyba:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Security PIN / Password Endpoints ---
  // GET /api/security/pin - check security configuration
  app.get('/api/security/pin', (req, res) => {
    res.json({
      configured: true,
      hasPin: true,
    });
  });

  // POST /api/security/verify - verify entered PIN
  app.post('/api/security/verify', (req, res) => {
    const { pin } = req.body || {};
    const stored = getSecurityPin();
    if (pin && String(pin).trim() === stored) {
      return res.json({ success: true, authorized: true });
    }
    return res.status(401).json({ success: false, error: 'Nesprávný bezpečnostní PIN' });
  });

  // POST /api/security/pin - update security PIN
  app.post('/api/security/pin', (req, res) => {
    const { currentPin, newPin } = req.body || {};
    const stored = getSecurityPin();
    if (!currentPin || String(currentPin).trim() !== stored) {
      return res.status(401).json({ success: false, error: 'Stávající PIN není správný' });
    }
    if (!newPin || String(newPin).trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Nový PIN musí mít alespoň 4 znaky' });
    }
    setSecurityPin(String(newPin).trim());
    return res.json({ success: true, message: 'PIN byl úspěšně změněn' });
  });

  // --- Photo storage endpoints (Dedicated local disk storage & Firestore collection 'hike_photos') ---
  // POST /api/photos/upload: Upload high quality photo
  app.post('/api/photos/upload', async (req, res) => {
    try {
      const { hikeId, dataUrl, name, caption, width, height, sizeKb } = req.body;
      if (!dataUrl) {
        return res.status(400).json({ error: 'Chybí dataUrl fotografie' });
      }

      const savedPhoto = await savePhotoDataUrl(dataUrl, hikeId || '', {
        name,
        caption,
        width,
        height,
        sizeKb,
      });

      return res.json(savedPhoto);
    } catch (err: any) {
      console.error('[API /api/photos/upload] Chyba při ukládání fotky:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/photos/:id: Get photo by id (default: streams binary image for img tags; ?meta=1 returns JSON metadata)
  app.get('/api/photos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const binPath = path.join(photosDir, `${id}.bin`);
      const jsonPath = path.join(photosDir, `${id}.json`);

      // 1. If metadata specifically requested:
      if (req.query.meta === '1') {
        if (fs.existsSync(jsonPath)) {
          const photoData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          return res.json(photoData);
        }
        if (db) {
          const photoSnap = await getDoc(doc(db, 'hike_photos', id));
          if (photoSnap.exists()) {
            return res.json(photoSnap.data());
          }
        }
        return res.status(404).json({ error: 'Metadata fotografie nenalezena' });
      }

      let fileName = 'foto.jpg';
      if (fs.existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          if (meta.name) fileName = meta.name;
        } catch {}
      }

      const isDownload = req.query.raw === '1' || req.query.download === '1';

      // 2. Default: Stream binary image directly (compatible with all <img> tags and lightboxes)
      if (fs.existsSync(binPath)) {
        let mimeType = 'image/jpeg';
        try {
          const fd = fs.openSync(binPath, 'r');
          const head = Buffer.alloc(16);
          fs.readSync(fd, head, 0, 16, 0);
          fs.closeSync(fd);
          if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) mimeType = 'image/jpeg';
          else if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';
          else if (head[0] === 0x89 && head.toString('ascii', 1, 4) === 'PNG') mimeType = 'image/png';
        } catch {}
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        if (isDownload) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        }
        return res.sendFile(binPath);
      }

      if (fs.existsSync(jsonPath)) {
        const photoData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (typeof photoData.dataUrl === 'string') {
          const matches = photoData.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const buffer = Buffer.from(matches[2], 'base64');
            res.setHeader('Content-Type', matches[1]);
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            if (isDownload) {
              res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            }
            return res.send(buffer);
          }
        }
      }

      // 3. Fallback to Firestore (with chunk reassembly)
      if (db) {
        try {
          const photoSnap = await getDoc(doc(db, 'hike_photos', id));
          if (photoSnap.exists()) {
            const photoData = photoSnap.data();
            let fullDataUrl = photoData.dataUrl || '';
            if (photoData.isChunked) {
              fullDataUrl = photoData.dataUrlChunk0 || '';
              const total = photoData.totalChunks || 1;
              for (let i = 1; i < total; i++) {
                const chunkSnap = await getDoc(doc(db, `hike_photos/${id}/chunks`, `chunk_${i}`));
                if (chunkSnap.exists()) {
                  fullDataUrl += chunkSnap.data().data || '';
                }
              }
            }

            if (typeof fullDataUrl === 'string') {
              const matches = fullDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                try {
                  fs.writeFileSync(binPath, buffer);
                } catch {}
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
                if (isDownload) {
                  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(photoData.name || fileName)}"`);
                }
                return res.send(buffer);
              }
            }
          }
        } catch (dbErr: any) {
          console.warn('[API /api/photos/:id] Firestore chyba:', dbErr.message);
        }
      }

      return res.status(404).json({ error: 'Fotografie nenalezena' });
    } catch (err: any) {
      console.error('[API /api/photos/:id] Chyba:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/photos/:id: Delete photo
  app.delete('/api/photos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const binPath = path.join(photosDir, `${id}.bin`);
      const jsonPath = path.join(photosDir, `${id}.json`);
      if (fs.existsSync(binPath)) {
        try { fs.unlinkSync(binPath); } catch {}
      }
      if (fs.existsSync(jsonPath)) {
        try { fs.unlinkSync(jsonPath); } catch {}
      }

      if (db) {
        deleteDoc(doc(db, 'hike_photos', id)).catch(() => {});
      }
      return res.json({ success: true, message: 'Fotografie smazána' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for dev or static serving for production / dist fallback
  const hasSrcApp = fs.existsSync(path.join(process.cwd(), 'src', 'App.tsx'));
  if (process.env.NODE_ENV !== 'production' && hasSrcApp) {
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
