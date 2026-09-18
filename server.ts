import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json({ limit: '10mb' }));

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
  app.post('/api/telegram/webhook', (req, res) => {
    const update = req.body;
    console.log('Přijata Telegram aktualizace:', JSON.stringify(update));

    // Handle bot message
    if (update?.message?.text) {
      const text: string = update.message.text;
      const fromUser = update.message.from?.username || update.message.from?.first_name || 'Uživatel';

      return res.json({
        ok: true,
        received: {
          text,
          from: fromUser,
          parsedHikeCandidate: text.startsWith('/tura') || text.startsWith('/hike'),
        },
      });
    }

    res.json({ ok: true, message: 'Webhook přijat.' });
  });

  // 3. Telegram Simulator / Test message endpoint
  app.post('/api/telegram/test-send', (req, res) => {
    const { message, key } = req.body;
    res.json({
      ok: true,
      simulatedResponse: `Zpráva "${message}" byla úspěšně zpracována botem Horský Deník.`,
      authorized: key === '1234' || key === '0000',
    });
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
