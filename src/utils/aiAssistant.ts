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
    const lowerNotes = notes.toLowerCase();
    const hasBeer = /piv[oa]|plzeň|radegast|půllitr|hospoda|výčep/i.test(lowerNotes);
    const hasFood = /knedlík|klobás|polévk|borůvk|guláš|svačin|hlad|jídlo/i.test(lowerNotes);
    const hasLegsPain = /nohy|stehn|kolen|sval|pálil|dech|plíce|mordor|krpál|stoupání|kopec|pot/i.test(lowerNotes);
    const hasWeatherIssues = /mlh|mrak|déšť|pršel|vítr|fučel|vichr|zima|mokr|blát/i.test(lowerNotes);
    const hasLost = /ztratil|zabloudil|kufr|bloud|hledal|cesta|značk/i.test(lowerNotes);

    if (tone === 'concise') {
      // Truly concise (2-3 sentences max)
      const part1 = hasLegsPain
        ? `Výšlap na ${name} dal nohám a stehnům pořádně zabrat.`
        : `Pohodový výstup na ${name} v pohoří ${range} nabídl skvělé horské výhledy.`;
      
      let part2 = '';
      if (hasLost) {
        part2 = ' Na chvíli jsme si sice zahráli na průzkumníky mimo značku, ale správný směr jsme našli.';
      } else if (hasWeatherIssues) {
        part2 = ' Horský vítr a mraky prověřily morálku, ale nahoře to stálo za to.';
      } else if (hasBeer || hasFood) {
        part2 = ` Odměna na chatě v podobě ${hasFood ? 'dobrého jídla' : ''}${hasFood && hasBeer ? ' a ' : ''}${hasBeer ? 'oroseného piva' : ''} vrátila sílu do žil.`;
      }

      const part3 = ` Parádní den v horách, na který se bude hezky vzpomínat.`;
      story = `${part1}${part2}${part3}`.replace(/\s{2,}/g, ' ');
      oneLiner = hasBeer || hasFood
        ? `Nohy bolely, ale orosené pivo a vrchol na ${name} to zachránily!`
        : `Poctivý výšlap na ${name}, který stál za každou kapku potu!`;
    } else {
      // Witty / Adventurous (3-4 sentences)
      const part1 = `Na ${name} (${range}) jsme vyrazili s odhodláním a nohy brzy poznaly, že kopce tady nejsou zadarmo. `;
      const part2 = hasWeatherIssues
        ? 'Mlha a vítr sice zkoušely naši trpělivost, ale k horám trocha divočiny patří. '
        : 'Výhledy do údolí spolehlivě vyhnaly z hlavy všechen městský shon. ';
      const part3 = (hasBeer || hasFood)
        ? 'Záchrana v podobě horské chaty a zaslouženého piva přišla přesně včas. '
        : 'Závěrečný sestup byl za odměnu. ';
      const part4 = `Poctivých ${distanceKm ? `${distanceKm} km` : 'pár kilometrů'}, které stály za to!`;
      story = `${part1}${part2}${part3}${part4}`;
      oneLiner = `Když nohy nemůžou, vidina chaty tě na ${name} vytáhne!`;
    }
  } else {
    // Default concise when notes are empty
    if (difficulty === 'ferrata') {
      story = `Zajištěná ferrata na ${name} (${range}) nabídla parádní porci železa ve skále a vzrušující vzdušné pasáže. Výhledy z vrcholu byly zaslouženou odměnou za překonanou gravitaci.`;
      oneLiner = `Cvakání karabin, vzduch pod nohama a nahoře čistá radost na ${name}!`;
    } else {
      story = `Příjemná túra na ${name} v pohoří ${range} s čistou hlavou a horským větrem v zádech. Krásná trasa, která příjemně unaví tělo a dobije baterky na maximum.`;
      oneLiner = `Horský vzduch na ${name} a nohy příjemně unavené – tak to má být!`;
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
