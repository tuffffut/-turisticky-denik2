import { HikeAISummary, HikeDifficulty } from '../types';

export interface GenerateHikeAIParams {
  mountainName: string;
  mountainRange: string;
  difficulty: HikeDifficulty;
  distanceKm?: number;
  elevationGainM?: number;
  weather?: string;
  rawNotes?: string;
  tone?: 'concise' | 'witty' | 'adventurous';
}

export async function generateHikeAITips(params: GenerateHikeAIParams): Promise<HikeAISummary> {
  // Ensure default tone is concise
  const finalParams: GenerateHikeAIParams = {
    ...params,
    tone: params.tone || 'concise',
  };

  // 1. First attempt to call the full-stack server-side Gemini API
  try {
    const res = await fetch('/api/gemini/generate-hike-tips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalParams),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data as HikeAISummary;
      }
    }
  } catch (err) {
    console.info('Serverový Gemini endpoint není dostupný, použije se lokální generátor.', err);
  }

  // 2. Client-side fallback generator for offline / static hosting
  return generateClientFallbackTips(finalParams);
}

function generateClientFallbackTips(params: GenerateHikeAIParams): HikeAISummary {
  const {
    mountainName,
    mountainRange,
    difficulty,
    distanceKm,
    elevationGainM,
    weather,
    rawNotes,
    tone = 'concise',
  } = params;

  const name = mountainName.trim() || 'Horský vrchol';
  const range = mountainRange.trim() || 'Hory';
  const notes = (rawNotes || '').trim();

  let story = '';
  let oneLiner = '';

  if (notes.length > 0) {
    // Break user notes into distinct thoughts/lines
    const rawSegments = notes
      .split(/[\n,.;•\-\t]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);

    // Capitalize first letter helper
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

    const primaryThought = rawSegments[0] || notes;
    const secondaryThought = rawSegments.length > 1 ? rawSegments[1] : null;
    const thirdThought = rawSegments.length > 2 ? rawSegments[2] : null;

    if (tone === 'witty') {
      // Witty & humorous style with direct reference to their notes
      const intro = `Výprava na ${name} (${range}) se rozhodně zapsala do paměti: ${uncap(primaryThought)}.`;
      const middle = secondaryThought
        ? ` Do toho navíc přišlo ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}, takže o horskou zábavu nebyla nouze.`
        : ` Žádná horská idylka z katalogu, ale poctivý autentický zážitek, jak má být.`;
      const outro = ` Ve výsledku jsme to ale zvládli se ctí a zaslouženým úsměvem na tváři.`;
      story = `${intro}${middle}${outro}`;
      oneLiner = `„${cap(primaryThought)}“ – zkrátka nezapomenutelný den na ${name}!`;
    } else if (tone === 'adventurous') {
      // Adventurous tone
      const intro = `Výstup na ${name} prověřil naše síly i odhodlání: ${uncap(primaryThought)}.`;
      const middle = secondaryThought
        ? ` Terén a podmínky nám nic neodpustily (${secondaryThought}${thirdThought ? `, ${thirdThought}` : ''}), ale ten horský vzduch stál za každý krok.`
        : ` Zdolání trasy v pohoří ${range} přineslo čistou horskou radost a skvělý pocit v nohách.`;
      const outro = ` Parádní horské dobrodružství, které bychom si klidně zopakovali.`;
      story = `${intro}${middle}${outro}`;
      oneLiner = `${cap(primaryThought)} – poctivých ${distanceKm ? `${distanceKm} km` : 'kilometrů'} čistého horského zážitku!`;
    } else {
      // Concise tone (2-3 clean, punchy sentences)
      const intro = `Při výpravě na ${name} v pohoří ${range} šlo hlavně o to, že ${uncap(primaryThought)}.`;
      const middle = secondaryThought
        ? ` Nechybělo ani ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}.`
        : ` Trasa nabídla skvělé momenty i zaslouženou únavu v nohách.`;
      const outro = ` Celkově parádní den v horách se skvělými vzpomínkami.`;
      story = `${intro}${middle}${outro}`;
      oneLiner = `${cap(primaryThought)} na vrcholu ${name}!`;
    }
  } else {
    // Fallback when no notes were provided at all
    if (difficulty === 'ferrata') {
      story = `Zajištěná ferrata na ${name} (${range}) nabídla parádní porci železa ve skále a vzdušné pasáže s výhledy. Převýšení dalo zabrat, ale vrcholová euforie byla stoprocentní.`;
      oneLiner = `Cvakání karabin, vzduch pod nohama a nahoře čistá radost na ${name}!`;
    } else {
      story = `Příjemná túra na ${name} v pohoří ${range} s čistou hlavou a horským větrem v zádech. Krásná trasa, která příjemně unaví tělo a dobije baterky na maximum.`;
      oneLiner = `Horský vzduch na ${name} a nohy příjemně unavené – tak to má v horách vypadat!`;
    }
  }

  // Safety advice
  let safety = '';
  if (difficulty === 'ferrata') {
    safety = 'Kompletní ferratový set s přilbou a rukavicemi je nutnost. Při náznaku bouřky okamžitě sestupte!';
  } else if ((elevationGainM && elevationGainM > 800) || difficulty === 'hard') {
    safety = 'Pevná kotníková obuv a nabitý telefon s aplikací Záchranka jsou základ. Nepřeceňujte síly na sestupu.';
  } else {
    safety = 'Držte se značené trasy, sledujte předpověď a mějte s sebou dostatek tekutin a větrovku.';
  }

  // Highlights
  let highlights = '';
  if (/sněžk/i.test(name)) {
    highlights = 'Obří důl, chata Růžohorky a Česká poštovna na vrcholu Sněžky.';
  } else if (/rysy/i.test(name)) {
    highlights = 'Chata pod Rysmi (2250 m), Žabie plesá a vyhlídka na Mořské oko.';
  } else if (/praděd/i.test(name)) {
    highlights = 'Vodopády Bílé Opavy, chata Barborka a vysílač na vrcholu Pradědu.';
  } else {
    highlights = `Hřebenová trasa pohořím ${range} a vrcholová vyhlídka.`;
  }

  // Gear
  const gear = [
    'Pevná prošlápnutá obuv',
    'Nepromokavá bunda / větrovka',
    'Láhev s vodou',
    'Nabitý telefon s offline mapou',
  ];
  if (difficulty === 'ferrata') {
    gear.unshift('Certifikovaný ferratový tlumič pádu', 'Horolezecká přilba a sedák');
  }

  return {
    story,
    oneLiner,
    rawNotesOriginal: notes || undefined,
    safety,
    highlights,
    gear,
    bestSeason: 'Květen až říjen',
    weatherTips: weather ? `Hlášené podmínky: ${weather}.` : 'Ideální je vyrazit dopoledne s časovou rezervou.',
    generatedAt: new Date().toISOString(),
  };
}
