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
  locationCoords?: { lat: number; lng: number };
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
    locationCoords,
  } = params;

  const name = mountainName.trim() || 'Výlet';
  const range = mountainRange.trim() || 'Česko';
  const notes = (rawNotes || '').trim();

  // Smart check: is this a city/lowland/cultural trip rather than high-alpine terrain?
  const isCityOrLowland =
    /litomyšl|praha|brno|pardubic|hradec|olomouc|zámek|měst|park|zahrada|památk|stezk|pomezí|polabí|kras|rybník/i.test(name) ||
    /litomyšl|pomezí|polabí|pálava|český ráj|praha/i.test(range) ||
    (locationCoords && locationCoords.lat >= 49.75 && locationCoords.lat <= 50.05 && locationCoords.lng >= 16.15 && locationCoords.lng <= 16.65) ||
    (elevationGainM !== undefined && elevationGainM < 250);

  let story = '';
  let oneLiner = '';

  if (notes.length > 0) {
    // Break user notes into distinct thoughts/lines
    const rawSegments = notes
      .split(/[\n,.;•\-\t]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

    const primaryThought = rawSegments[0] || notes;
    const secondaryThought = rawSegments.length > 1 ? rawSegments[1] : null;
    const thirdThought = rawSegments.length > 2 ? rawSegments[2] : null;

    if (isCityOrLowland) {
      if (tone === 'witty') {
        const intro = `Výprava do ${name} (${range}) přinesla přesně to pravé: ${uncap(primaryThought)}.`;
        const middle = secondaryThought
          ? ` K tomu navíc ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}, takže o zážitky nebyla nouze.`
          : ` Žádný spěch ani stres, jen poctivý autentický den podle plánu.`;
        const outro = ` Ve výsledku pohodová procházka a skvěle strávený čas.`;
        story = `${intro}${middle}${outro}`;
        oneLiner = `„${cap(primaryThought)}“ – zkrátka vydařený výlet v ${name}!`;
      } else {
        const intro = `Procházka a návštěva ${name} (${range}) se točila hlavně kolem toho, že ${uncap(primaryThought)}.`;
        const middle = secondaryThought
          ? ` Příjemným zpestřením bylo ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}.`
          : ` Trasa nabídla hezká zákoutí a příjemný relax.`;
        const outro = ` Celkově parádní odpočinkový den se spoustou hezkých vjemů.`;
        story = `${intro}${middle}${outro}`;
        oneLiner = `${cap(primaryThought)} v ${name}!`;
      }
    } else {
      if (tone === 'witty') {
        const intro = `Výprava na ${name} (${range}) se rozhodně zapsala do paměti: ${uncap(primaryThought)}.`;
        const middle = secondaryThought
          ? ` Do toho navíc přišlo ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}, takže o horskou zábavu nebyla nouze.`
          : ` Žádná horská idylka z katalogu, ale poctivý autentický zážitek, jak má být.`;
        const outro = ` Ve výsledku jsme to ale zvládli se ctí a zaslouženým úsměvem na tváři.`;
        story = `${intro}${middle}${outro}`;
        oneLiner = `„${cap(primaryThought)}“ – zkrátka nezapomenutelný den na ${name}!`;
      } else if (tone === 'adventurous') {
        const intro = `Výstup na ${name} prověřil naše síly i odhodlání: ${uncap(primaryThought)}.`;
        const middle = secondaryThought
          ? ` Terén a podmínky nám nic neodpustily (${secondaryThought}${thirdThought ? `, ${thirdThought}` : ''}), ale ten horský vzduch stál za každý krok.`
          : ` Zdolání trasy v pohoří ${range} přineslo čistou horskou radost a skvělý pocit v nohách.`;
        const outro = ` Parádní horské dobrodružství, které bychom si klidně zopakovali.`;
        story = `${intro}${middle}${outro}`;
        oneLiner = `${cap(primaryThought)} – poctivých ${distanceKm ? `${distanceKm} km` : 'kilometrů'} čistého horského zážitku!`;
      } else {
        const intro = `Při výpravě na ${name} v pohoří ${range} šlo hlavně o to, že ${uncap(primaryThought)}.`;
        const middle = secondaryThought
          ? ` Nechybělo ani ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}.`
          : ` Trasa nabídla skvělé momenty i zaslouženou únavu v nohách.`;
        const outro = ` Celkově parádní den v horách se skvělými vzpomínkami.`;
        story = `${intro}${middle}${outro}`;
        oneLiner = `${cap(primaryThought)} na vrcholu ${name}!`;
      }
    }
  } else {
    // Fallback when no notes were provided at all
    if (isCityOrLowland) {
      story = `Příjemná procházka a výlet v lokalitě ${name} (${range}) s pohodovou atmosférou a čistou hlavou. Skvělá trasa na načerpání nové energie a odpočinek.`;
      oneLiner = `Pohodový výlet a čistá hlava v ${name}!`;
    } else if (difficulty === 'ferrata') {
      story = `Zajištěná ferrata na ${name} (${range}) nabídla parádní porci železa ve skále a vzdušné pasáže s výhledy. Převýšení dalo zabrat, ale vrcholová euforie byla stoprocentní.`;
      oneLiner = `Cvakání karabin, vzduch pod nohama a nahoře čistá radost na ${name}!`;
    } else {
      story = `Příjemná túra na ${name} v pohoří ${range} s čistou hlavou a horským větrem v zádech. Krásná trasa, která příjemně unaví tělo a dobije baterky na maximum.`;
      oneLiner = `Horský vzduch na ${name} a nohy příjemně unavené – tak to má v horách vypadat!`;
    }
  }

  // Safety advice
  let safety = '';
  if (isCityOrLowland) {
    safety = 'Pohodová trasa po zpevněných cestách a chodnících bez horských rizik. Sledujte aktuální počasí.';
  } else if (difficulty === 'ferrata') {
    safety = 'Kompletní ferratový set s přilbou a rukavicemi je nutnost. Při náznaku bouřky okamžitě sestupte!';
  } else if ((elevationGainM && elevationGainM > 800) || difficulty === 'hard') {
    safety = 'Pevná kotníková obuv a nabitý telefon s aplikací Záchranka jsou základ. Nepřeceňujte síly na sestupu.';
  } else {
    safety = 'Držte se značené trasy, sledujte předpověď a mějte s sebou dostatek tekutin a větrovku.';
  }

  // Highlights
  let highlights = '';
  if (/litomyšl/i.test(name) || /litomyšl/i.test(range)) {
    highlights = 'Renesanční zámek Litomyšl (UNESCO) se sgrafitovou výzdobou, Klášterní zahrady a Smetanovo náměstí.';
  } else if (/sněžk/i.test(name)) {
    highlights = 'Obří důl, chata Růžohorky a Česká poštovna na vrcholu Sněžky.';
  } else if (/rysy/i.test(name)) {
    highlights = 'Chata pod Rysmi (2250 m), Žabie plesá a vyhlídka na Mořské oko.';
  } else if (/praděd/i.test(name)) {
    highlights = 'Vodopády Bílé Opavy, chata Barborka a vysílač na vrcholu Pradědu.';
  } else if (isCityOrLowland) {
    highlights = `Historické památky, vyhlídková místa a parky v oblasti ${range}.`;
  } else {
    highlights = `Hřebenová trasa pohořím ${range} a vyhlídkové body.`;
  }

  // Gear
  const gear = isCityOrLowland
    ? [
        'Pohodlná vycházková obuv',
        'Fotoaparát či chytrý telefon',
        'Láhev s pitím',
        'Karta či drobné na občerstvení',
      ]
    : [
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
