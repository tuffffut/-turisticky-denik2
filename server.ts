import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

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

// Server-side GPX track parser (robust regex-based with jitter filtering, duration & date)
function parseServerGpx(xmlString: string) {
  const points: { lat: number; lng: number; ele?: number; time?: string; distFromStartKm?: number }[] = [];
  const ptRegex = /<(?:trkpt|rtept|wpt)\s+[^>]*lat=["']([^"']+)["']\s+[^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;
  const ptRegex2 = /<(?:trkpt|rtept|wpt)\s+[^>]*lon=["']([^"']+)["']\s+[^>]*lat=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;

  const raw: { lat: number; lng: number; ele?: number; time?: string; timestampMs?: number }[] = [];
  let match;
  let firstTimestamp: Date | null = null;
  let lastTimestamp: Date | null = null;

  while ((match = ptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const inner = match[3];
    const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(inner);
    const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
    const time = timeMatch ? timeMatch[1].trim() : undefined;
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
      raw.push({ lat, lng, ele, time, timestampMs });
    }
  }

  if (raw.length === 0) {
    while ((match = ptRegex2.exec(xmlString)) !== null) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      const inner = match[3];
      const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(inner);
      const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
      const time = timeMatch ? timeMatch[1].trim() : undefined;
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
        raw.push({ lat, lng, ele, time, timestampMs });
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
      const d2d = haversineDistanceKm(prev.lat, prev.lng, pt.lat, pt.lng);

      let dtSecs: number | null = null;
      if (prev.timestampMs && pt.timestampMs) {
        dtSecs = (pt.timestampMs - prev.timestampMs) / 1000;
      }

      const speedKmh = dtSecs && dtSecs > 0 ? d2d / (dtSecs / 3600) : null;
      const isGlitch = speedKmh !== null && speedKmh > 130;
      const isStationary = speedKmh !== null && speedKmh < 0.6 && d2d < 0.003;

      if (!isGlitch && !isStationary && d2d > 0) {
        let d3d = d2d;
        if (pt.ele !== undefined && prev.ele !== undefined) {
          const eleDiffKm = Math.abs(pt.ele - prev.ele) / 1000;
          d3d = Math.sqrt(d2d * d2d + eleDiffKm * eleDiffKm);
        }
        totalDistKm += d3d;
      }

      if (dtSecs && dtSecs > 0 && dtSecs < 600) {
        if (speedKmh === null || (speedKmh >= 0.5 && speedKmh <= 120)) {
          movingDurationSecs += dtSecs;
        }
      }

      if (pt.ele !== undefined && prev.ele !== undefined) {
        const diff = pt.ele - prev.ele;
        if (diff > 0.8) {
          calculatedGain += diff;
        } else if (diff < -0.8) {
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

  // Calculate Duration
  let durationSecs = 0;
  if (movingDurationSecs >= 60) {
    durationSecs = movingDurationSecs;
  } else if (firstTimestamp && lastTimestamp) {
    durationSecs = Math.max(0, (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000);
  } else {
    // Naismith's hiking rule
    durationSecs = Math.max(1800, Math.round((totalDistKm / 4.0 + calculatedGain / 600.0) * 3600));
  }

  const hours = Math.floor(durationSecs / 3600);
  const mins = Math.round((durationSecs % 3600) / 60);
  const formattedDuration = hours > 0 ? `${hours}h ${mins.toString().padStart(2, '0')}m` : `${mins}m`;

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
    durationMinutes: Math.round(durationSecs / 60),
    date: activityDate,
    minEle: minEle === Number.POSITIVE_INFINITY ? undefined : Math.round(minEle),
    maxEle: maxEle === Number.NEGATIVE_INFINITY ? undefined : Math.round(maxEle),
    highestPoint: highestPoint || { lat: 50.736, lng: 15.74 },
  };
}

// Mountain range detector from GPS coordinates
function detectRangeFromCoords(lat: number, lng: number): string {
  if (lat >= 50.55 && lat <= 50.85 && lng >= 15.35 && lng <= 15.95) return 'Krkonoše';
  if (lat >= 50.75 && lat <= 50.95 && lng >= 15.05 && lng <= 15.45) return 'Jizerské hory';
  if (lat >= 48.80 && lat <= 49.35 && lng >= 13.15 && lng <= 14.15) return 'Šumava';
  if (lat >= 50.00 && lat <= 50.35 && lng >= 17.00 && lng <= 17.55) return 'Jeseníky';
  if (lat >= 49.35 && lat <= 49.65 && lng >= 18.15 && lng <= 18.70) return 'Beskydy';
  if (lat >= 50.35 && lat <= 50.85 && lng >= 12.35 && lng <= 14.15) return 'Krušné hory';
  if (lat >= 49.10 && lat <= 49.30 && lng >= 19.80 && lng <= 20.30) return 'Vysoké Tatry';
  if (lat >= 48.85 && lat <= 49.05 && lng >= 19.45 && lng <= 20.25) return 'Nízke Tatry';
  if (lat >= 49.15 && lat <= 49.30 && lng >= 19.55 && lng <= 19.85) return 'Západné Tatry';
  if (lat >= 49.05 && lat <= 49.30 && lng >= 18.95 && lng <= 19.25) return 'Malá Fatra';
  return 'České hory';
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
        weather,
        rawNotes,
        tone,
      } = req.body;

      if (!mountainName && !mountainRange && !rawNotes) {
        return res.status(400).json({
          error: 'Zadejte alespoň název hory nebo vaše poznámky z cesty.',
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
      const prompt = `Jsi chytrý, vtipný a autentický horský vypravěč.
Uživatel si do deníku zapsal tyto své konkrétní poznámky a postřehy z horské výpravy:
"""
${userNotesClean || 'Žádné poznámky nezadány – vygeneruj svěží zážitek z túry.'}
"""

Kontext túry:
- Vrchol / Trasa: ${mountainName || 'Horský vrchol'}
- Pohoří: ${mountainRange || 'Střední Evropa'}
- Náročnost: ${difficulty || 'střední'} (možné: lehká, střední, těžká, ferrata)
- Délka trasy: ${distanceKm ? `${distanceKm} km` : 'neuvedeno'}
- Převýšení: ${elevationGainM ? `+${elevationGainM} m` : 'neuvedeno'}
- Počasí / podmínky: ${weather || 'horské proměnlivé'}
- Požadovaný styl: ${tone === 'adventurous' ? 'dobrodružný a svižný' : tone === 'witty' ? 'odlehčený, vtipný a s horským nadhledem' : 'stručný, úderný, čtivý a autentický'}

HLAVNÍ ÚKOLY A KRITICKÁ PRAVIDLA:
1. VĚRNOST POZNÁMKÁM: Pokud uživatel zadal poznámky, příběh ("story") i shrnutí ("oneLiner") MUSÍ přímo a zřetelně zapracovat VŠECHNY jeho konkrétní postřehy, zmínky, lidi, jídla, únavu, chyby či zážitky! Nesmíš jeho poznámky ignorovat ani nahradit generickým klišé.
2. STRUČNOST: Text "story" musí být úderný – přesně 2 až 4 svižné, čtivé věty (jeden ucelený odstavec). Žádné zdlouhavé slohy!
3. JAZYK: Přirozená, hovorově přátelská moderní čeština, s lehkým horským humorem.

Odpověz ve formátu JSON s těmito poli v češtině:
{
  "story": "Hotový přepsaný čtivý text přímo z poznámek (2-4 věty)...",
  "oneLiner": "Krátká trefná hláška nebo pointa vystihující tuto konkrétní túru a poznámky.",
  "safety": "Klíčová bezpečnostní doporučení a rizika terénu pro tuto trasu.",
  "highlights": "Zajímavá místa na trase (chaty, plesa, vyhlídky).",
  "gear": ["položka 1", "položka 2", "položka 3", "položka 4"],
  "bestSeason": "Doporučené měsíce pro výstup.",
  "weatherTips": "Praktické rady k počasí a času vyražení."
}`;

      // Try modern high-performing Gemini models in priority order
      const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
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
      const finalTitle = title || parsedGpx?.name || 'Horská túra z Garminu';
      const finalDistance = Number(distanceKm) || parsedGpx?.totalDistKm || 10;
      const finalGain = Number(elevationGainM) || parsedGpx?.gainM || 500;
      const finalLoss = Number(elevationLossM) || parsedGpx?.lossM || finalGain;

      // Format duration
      let formattedDuration = parsedGpx?.duration || '3h 30m';
      if (durationMinutes && !isNaN(Number(durationMinutes))) {
        const mins = Math.round(Number(durationMinutes));
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        formattedDuration = `${hours}h ${remMins < 10 ? '0' : ''}${remMins}m`;
      }

      // Peak coordinates & mountain range
      const peakLat = parsedGpx?.highestPoint?.lat || 50.736;
      const peakLng = parsedGpx?.highestPoint?.lng || 15.74;
      const detectedRange = detectRangeFromCoords(peakLat, peakLng);

      const newHike = {
        id: routeId,
        title: finalTitle,
        mountainRange: detectedRange,
        date: date ? String(date).slice(0, 10) : (parsedGpx?.date || new Date().toISOString().split('T')[0]),
        distanceKm: Math.round(finalDistance * 10) / 10,
        elevationGainM: Math.round(finalGain),
        elevationLossM: Math.round(finalLoss),
        duration: formattedDuration,
        difficulty: finalGain > 1000 ? 'hard' : finalGain < 400 ? 'easy' : 'moderate',
        rating: 5,
        description:
          description ||
          'Nová túra z Garminu. Klikněte pro doplnění zážitků a fotek přes AI horského asistenta.',
        photos: [
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        ],
        highestPointM: parsedGpx?.maxEle || finalGain + 800,
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
      snapshot.forEach((d) => routes.push(d.data()));
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
      return res.json({ route: snap.data() });
    } catch (err: any) {
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
