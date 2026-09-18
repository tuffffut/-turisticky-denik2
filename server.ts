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

// Server-side GPX track parser (fast regex without browser DOM dependency)
function parseServerGpx(xmlString: string) {
  const points: { lat: number; lng: number; ele?: number; time?: string; distFromStartKm?: number }[] = [];
  const ptRegex = /<(?:trkpt|rtept|wpt)\s+[^>]*lat=["']([^"']+)["']\s+[^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;
  const ptRegex2 = /<(?:trkpt|rtept|wpt)\s+[^>]*lon=["']([^"']+)["']\s+[^>]*lat=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;

  const raw: { lat: number; lng: number; ele?: number; time?: string }[] = [];
  let match;

  while ((match = ptRegex.exec(xmlString)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const inner = match[3];
    const eleMatch = /<ele>([0-9.-]+)<\/ele>/i.exec(inner);
    const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : undefined;
    const time = timeMatch ? timeMatch[1] : undefined;
    if (!isNaN(lat) && !isNaN(lng)) {
      raw.push({ lat, lng, ele, time });
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
      const time = timeMatch ? timeMatch[1] : undefined;
      if (!isNaN(lat) && !isNaN(lng)) {
        raw.push({ lat, lng, ele, time });
      }
    }
  }

  let totalDistKm = 0;
  let minEle = Number.POSITIVE_INFINITY;
  let maxEle = Number.NEGATIVE_INFINITY;
  let highestPoint = raw[0];
  let calculatedGain = 0;

  for (let i = 0; i < raw.length; i++) {
    const pt = raw[i];
    if (i > 0) {
      const prev = raw[i - 1];
      const d = haversineDistanceKm(prev.lat, prev.lng, pt.lat, pt.lng);
      totalDistKm += d;
      if (pt.ele !== undefined && prev.ele !== undefined && pt.ele > prev.ele) {
        calculatedGain += pt.ele - prev.ele;
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
      ...pt,
      distFromStartKm: Math.round(totalDistKm * 100) / 100,
    });
  }

  const nameMatch = /<name>([^<]+)<\/name>/i.exec(xmlString);
  const name = nameMatch ? nameMatch[1].trim() : undefined;

  return {
    name,
    trackPoints: points,
    totalDistKm: Math.round(totalDistKm * 10) / 10,
    gainM: Math.round(calculatedGain),
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

      const prompt = `Jsi chytrý, vtipný a poutavý horský vypravěč.
Uživatel si zapsal tyto poznámky z horské výpravy:
"${rawNotes || 'stoupání dalo zabrat, nohy bolely, ale výhledy stály za to a na chatě bylo parádní pivo'}"

Kontext túry:
- Vrchol / Trasa: ${mountainName || 'Horský vrchol'}
- Pohoří: ${mountainRange || 'Střední Evropa'}
- Náročnost: ${difficulty || 'střední'} (možné: lehká, střední, těžká, ferrata)
- Délka trasy: ${distanceKm ? `${distanceKm} km` : 'neuvedeno'}
- Převýšení: ${elevationGainM ? `+${elevationGainM} m` : 'neuvedeno'}
- Počasí / podmínky: ${weather || 'horské proměnlivé'}
- Požadovaný styl: ${tone === 'adventurous' ? 'dobrodružný a svižný' : 'stručný, úderný, čtivý a lehce vtipný'}

HLAVNÍ ÚKOL:
Přepiš uživatelovy poznámky do KRÁTKÉHO, skvěle čitelného a trochu vtipného zápisku do deníku.
KRITICKÉ PRAVIDLO: Text musí být OPRAVDU STRUČNÝ – pouze 2 až 4 krátké svižné věty (jeden kompaktní odstavec). Žádné zdlouhavé popisy ani mnohověté omáčky!
1. Zachovej konkrétní věci, které uživatel zmínil (pivo, knedlík, počasí, unavené nohy, kamarádi).
2. Dodej tomu lehký horský humor a nadhled.
3. Přirozená, hovorová a přátelská čeština bez klišé.

Odpověz ve formátu JSON s těmito poli v češtině:
{
  "story": "Hotový přepsaný čtivý a vtipný deníkový text na základě poznámek...",
  "oneLiner": "Krátká vtipná hláška / shrnutí výpravy v jedné větě.",
  "safety": "Klíčová bezpečnostní doporučení a rizika terénu (např. suťoviště, blesky, jištění na ferratě, mlha).",
  "highlights": "Zajímavá místa na trase (chaty, plesa, vyhlídky).",
  "gear": ["položka 1", "položka 2", "položka 3", "položka 4"],
  "bestSeason": "Doporučené měsíce pro výstup.",
  "weatherTips": "Praktické rady k počasí a času vyražení."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
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

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Prázdná odpověď od Gemini modelu');
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
      const finalLoss = Number(elevationLossM) || finalGain;

      // Format duration
      let formattedDuration = '3h 30m';
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
        date: date ? String(date).slice(0, 10) : new Date().toISOString().split('T')[0],
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
