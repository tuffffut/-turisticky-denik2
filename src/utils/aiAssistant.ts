import { HikeAISummary, HikeDifficulty } from '../types';

export interface GenerateHikeAIParams {
  mountainName: string;
  mountainRange: string;
  difficulty?: HikeDifficulty;
  distanceKm?: number;
  elevationGainM?: number;
  duration?: string;
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

function fixCommonTypos(text: string): string {
  if (!text) return '';
  return text
    .replace(/\bbyli\s+sme\b/gi, 'byli jsme')
    .replace(/\bbyl\s+sem\b/gi, 'byl jsem')
    .replace(/\bšli\s+sme\b/gi, 'šli jsme')
    .replace(/\bjel\s+sem\b/gi, 'jel jsem')
    .replace(/\bdali\s+sme\b/gi, 'dali jsme')
    .replace(/\bvideli\s+sme\b/gi, 'viděli jsme')
    .replace(/\bprochaska\b/gi, 'procházka')
    .replace(/\bprochasku\b/gi, 'procházku')
    .replace(/\bpekna\b/gi, 'pěkná')
    .replace(/\bpekny\b/gi, 'pěkný')
    .replace(/\bvyborny\b/gi, 'výborné')
    .replace(/\bvyborne\b/gi, 'výborně')
    .replace(/\bnaměstí\b/gi, 'náměstí')
    .replace(/\bnamesti\b/gi, 'náměstí')
    .replace(/\bzamku\b/gi, 'zámku')
    .replace(/\bzamek\b/gi, 'zámek')
    .replace(/\bklastera\b/gi, 'kláštera')
    .replace(/\bklaster\b/gi, 'klášter')
    .replace(/\bhospode\b/gi, 'hospodě')
    .replace(/\bhospoda\b/gi, 'hospoda')
    .replace(/\bvyhled\b/gi, 'výhled')
    .replace(/\bvyhledy\b/gi, 'výhledy');
}

function generateClientFallbackTips(params: GenerateHikeAIParams): HikeAISummary {
  const {
    mountainName,
    mountainRange,
    difficulty,
    distanceKm,
    elevationGainM,
    duration,
    weather,
    rawNotes,
    tone = 'concise',
    locationCoords,
  } = params;

  const name = mountainName.trim() || 'Výlet';
  const range = mountainRange.trim() || 'Česko';
  const notes = fixCommonTypos((rawNotes || '').trim());

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

    const statsInfo = distanceKm ? `${distanceKm} km` : duration ? `${duration}` : '';

    if (isCityOrLowland) {
      if (tone === 'witty') {
        story = `Vyrazili jsme v klidném tempu a celý den se nesl v duchu toho, že ${uncap(primaryThought)}.${secondaryThought ? ` K tomu se přidalo ${uncap(secondaryThought)}${thirdThought ? ` i ${uncap(thirdThought)}` : ''}.` : ''} Žádný spěch ani stres, příjemná atmosféra a v cíli zasloužená pohoda.`;
        oneLiner = `Pohodový den, skvělá atmosféra a ${uncap(primaryThought)} jako zlatý hřeb.`;
      } else {
        story = `Celá trasa${statsInfo ? ` (${statsInfo})` : ''} nabídla parádní odpočinek, kdy hlavní roli hrálo ${uncap(primaryThought)}.${secondaryThought ? ` Příjemným zpestřením bylo ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}.` : ''} Skvěle strávený čas a čistá hlava.`;
        oneLiner = `${cap(primaryThought)} a příjemně strávený volný den.`;
      }
    } else {
      if (tone === 'witty') {
        story = `Na trase jsme si užili poctivý outdoor: ${uncap(primaryThought)}.${secondaryThought ? ` Nechybělo ani ${uncap(secondaryThought)}${thirdThought ? ` a ${uncap(thirdThought)}` : ''}.` : ''} Nohy sice dostaly trochu zabrat${elevationGainM ? ` (+${elevationGainM} m)` : ''}, ale ten zážitek stál za každý krok.`;
        oneLiner = `Autentický zážitek, poctivé kilometry a ${uncap(primaryThought)} za odměnu!`;
      } else if (tone === 'adventurous') {
        story = `Parádní výprava terénem: ${uncap(primaryThought)}.${secondaryThought ? ` Podmínky prověřily formu (${uncap(secondaryThought)}${thirdThought ? `, ${uncap(thirdThought)}` : ''}), ale ten horský vzduch stál za to.` : ''} V nohách máme poctivou porci kilometrů a v hlavě skvělé vzpomínky.`;
        oneLiner = `Poctivých ${distanceKm ? `${distanceKm} km` : 'kilometrů'} v nohách a čistá radost z pohybu!`;
      } else {
        story = `Trasa příjemně ubíhala a hlavním bodem programu bylo ${uncap(primaryThought)}.${secondaryThought ? ` Skvěle bodlo také ${uncap(secondaryThought)}${thirdThought ? ` i ${uncap(thirdThought)}` : ''}.` : ''} Příjemná únava v nohách a parádní pocit z vydařené cesty.`;
        oneLiner = `Skvělý den venku: ${uncap(primaryThought)} a vyčištěná hlava.`;
      }
    }
  } else {
    // Fallback when no notes were provided at all
    if (isCityOrLowland) {
      story = `Příjemná procházka s poklidnou atmosférou a čistou hlavou. Trasa nabídla hezká zákoutí, čas na kávu i odpočinek bez zbytečného spěchu.`;
      oneLiner = `Pohodový výlet, skvělá káva a čistá hlava.`;
    } else if (difficulty === 'ferrata') {
      story = `Zajištěná ferrata nabídla parádní porci železa ve skále a vzdušné pasáže s výhledy. Převýšení dalo zabrat, ale vrcholová euforie byla stoprocentní.`;
      oneLiner = `Cvakání karabin, vzduch pod nohama a nahoře čistá radost.`;
    } else {
      story = `Příjemná túra s čistou hlavou a horským větrem v zádech. Krásná trasa, která příjemně unaví tělo a dobije baterky na maximum.`;
      oneLiner = `Horský vzduch v plicích a nohy příjemně unavené – tak to má venku vypadat!`;
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
