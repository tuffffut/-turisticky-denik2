import { MountainHike, GPXTrackPoint } from '../types';
import { calculateDistanceKm, buildGPXXml } from '../utils/gpxParser';

// Helper to interpolate realistic waypoints along a mountain route
function generateRoutePoints(
  waypoints: { lat: number; lng: number; ele: number; name?: string }[],
  stepsPerSegment = 8
): GPXTrackPoint[] {
  const points: GPXTrackPoint[] = [];
  let cumDist = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];

    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      // Slight curve jitter for natural trail look
      const jitterLat = Math.sin(t * Math.PI) * 0.0003;
      const jitterLng = Math.cos(t * Math.PI) * 0.0003;

      const lat = p1.lat + (p2.lat - p1.lat) * t + jitterLat;
      const lng = p1.lng + (p2.lng - p1.lng) * t + jitterLng;
      // Smooth elevation
      const ele = Math.round(p1.ele + (p2.ele - p1.ele) * t);

      if (points.length > 0) {
        const prev = points[points.length - 1];
        cumDist += calculateDistanceKm(prev.lat, prev.lng, lat, lng);
      }

      points.push({
        lat,
        lng,
        ele,
        distFromStartKm: Math.round(cumDist * 100) / 100,
      });
    }
  }

  // Add final waypoint
  const last = waypoints[waypoints.length - 1];
  if (points.length > 0) {
    const prev = points[points.length - 1];
    cumDist += calculateDistanceKm(prev.lat, prev.lng, last.lat, last.lng);
  }
  points.push({
    lat: last.lat,
    lng: last.lng,
    ele: last.ele,
    distFromStartKm: Math.round(cumDist * 100) / 100,
  });

  return points;
}

// 1. Sněžka přes Obří důl (Krkonoše)
const snezkaWaypoints = [
  { lat: 50.6942, lng: 15.7335, ele: 760, name: 'Pec pod Sněžkou - parkoviště' },
  { lat: 50.7065, lng: 15.7312, ele: 820, name: 'U Modrého dolu' },
  { lat: 50.7225, lng: 15.7289, ele: 1010, name: 'Kaplička v Obřím dole' },
  { lat: 50.7310, lng: 15.7320, ele: 1250, name: 'Trkač a vodárna' },
  { lat: 50.7338, lng: 15.7390, ele: 1395, name: 'Slezské sedlo (Slezský dům)' },
  { lat: 50.7360, lng: 15.7396, ele: 1603, name: 'Sněžka - vrchol (1603 m)' },
  { lat: 50.7338, lng: 15.7390, ele: 1395, name: 'Slezské sedlo' },
  { lat: 50.7250, lng: 15.7600, ele: 1280, name: 'Růžová hora' },
  { lat: 50.7130, lng: 15.7580, ele: 1060, name: 'Bouda Růžohorky' },
  { lat: 50.6942, lng: 15.7335, ele: 760, name: 'Pec pod Sněžkou cíl' },
];
const snezkaPoints = generateRoutePoints(snezkaWaypoints, 7);

// 2. Rysy (Vysoké Tatry)
const rysyWaypoints = [
  { lat: 49.1245, lng: 20.0632, ele: 1350, name: 'Štrbské Pleso' },
  { lat: 49.1534, lng: 20.0792, ele: 1494, name: 'Popradské pleso' },
  { lat: 49.1620, lng: 20.0825, ele: 1620, name: 'Rozcestí nad Žabím potokem' },
  { lat: 49.1720, lng: 20.0890, ele: 1919, name: 'Veľké Žabie pleso' },
  { lat: 49.1760, lng: 20.0870, ele: 2120, name: 'Skalní práh s řetězy' },
  { lat: 49.1778, lng: 20.0865, ele: 2250, name: 'Chata pod Rysmi' },
  { lat: 49.1788, lng: 20.0872, ele: 2330, name: 'Sedlo Váha' },
  { lat: 49.1794, lng: 20.0881, ele: 2501, name: 'Rysy vrchol (2501 m)' },
  { lat: 49.1778, lng: 20.0865, ele: 2250, name: 'Chata pod Rysmi' },
  { lat: 49.1534, lng: 20.0792, ele: 1494, name: 'Popradské pleso' },
  { lat: 49.1245, lng: 20.0632, ele: 1350, name: 'Štrbské Pleso cíl' },
];
const rysyPoints = generateRoutePoints(rysyWaypoints, 8);

// 3. Praděd z Karlovy Studánky (Jeseníky)
const pradedWaypoints = [
  { lat: 50.0734, lng: 17.3065, ele: 800, name: 'Karlova Studánka - lázně' },
  { lat: 50.0760, lng: 17.2850, ele: 930, name: 'Ústí kaňonu Bílé Opavy' },
  { lat: 50.0790, lng: 17.2680, ele: 1050, name: 'Velký vodopád Bílé Opavy' },
  { lat: 50.0820, lng: 17.2480, ele: 1210, name: 'Lávky a dřevěné žebříky' },
  { lat: 50.0845, lng: 17.2395, ele: 1315, name: 'Chata Barborka' },
  { lat: 50.0833, lng: 17.2311, ele: 1491, name: 'Praděd vysílač a rozhledna (1491 m)' },
  { lat: 50.0750, lng: 17.2350, ele: 1305, name: 'Ovčárna' },
  { lat: 50.0710, lng: 17.2600, ele: 1100, name: 'Hvězda cesta' },
  { lat: 50.0734, lng: 17.3065, ele: 800, name: 'Karlova Studánka centrum' },
];
const pradedPoints = generateRoutePoints(pradedWaypoints, 7);

// 4. Ferrata HZS Martinské hole (Malá Fatra)
const ferrataWaypoints = [
  { lat: 49.0910, lng: 18.8350, ele: 520, name: 'Martin - Stráne (nástup)' },
  { lat: 49.0945, lng: 18.8310, ele: 680, name: 'Pivovarský potok' },
  { lat: 49.0980, lng: 18.8250, ele: 890, name: 'Nástup na Ferratu HZS (lanový most)' },
  { lat: 49.1010, lng: 18.8200, ele: 1150, name: 'Rozcestí variant B a C pod vodopádem' },
  { lat: 49.1040, lng: 18.8150, ele: 1260, name: 'Konec jištění ferraty' },
  { lat: 49.1080, lng: 18.8180, ele: 1446, name: 'Veľká Lúka - vysílač (1446 m)' },
  { lat: 49.0960, lng: 18.8330, ele: 900, name: 'Chata na Martinských holiach' },
  { lat: 49.0910, lng: 18.8350, ele: 520, name: 'Martin - Stráne cíl' },
];
const ferrataPoints = generateRoutePoints(ferrataWaypoints, 6);

export const SAMPLE_HIKES: MountainHike[] = [
  {
    id: 'hike-snezka-obri-dul',
    title: 'Sněžka přes Obří důl a Růžohorky',
    mountainRange: 'Krkonoše',
    date: '2026-07-12',
    distanceKm: 13.8,
    elevationGainM: 980,
    elevationLossM: 980,
    duration: '5h 25m',
    difficulty: 'moderate',
    rating: 5,
    highestPointM: 1603,
    lowestPointM: 760,
    weather: 'Jasno, mírný vítr na vrcholu, 18°C',
    description:
      'Legendární výstup ledovcovým Obřím dolem až na nejvyšší český vrchol. Začátek v Peci pod Sněžkou kolem řeky Úpy. V Obřím dole je nádherný klid a dramatické skalní stěny. Závěrečný výstup od Slezského domu po kamenitých serpentinách prověří nohy, ale kruhový výhled z vrcholu Sněžky (1603 m) na českou i polskou stranu stojí za každý krok. Návrat přes Růžovou horu se zastávkou na borůvkové knedlíky na boudě Růžohorky!',
    photos: [
      'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80',
    ],
    videos: [
      {
        id: 'vid-snezka-1',
        url: 'https://www.youtube.com/watch?v=kY31Wn9hW_A',
        title: 'Letecký přelet Obřího dolu a Sněžky z dronu',
        platform: 'youtube',
      },
    ],
    aiSummary: {
      story:
        'Ledovcový amfiteátr Obřího dolu se tyčí pod kolmými srázy Sněžky v téměř alpské scenérii. Kamenitý chodník strmě stoupá kolem historické vodárny až na Slezské sedlo, kde vás uvítá svěží horský vítr. Poslední úsek k České poštovně nabídne neuvěřitelný 360° rozhled přes celé Krkonoše až do polské nížiny.',
      oneLiner: 'Obří důl prověřil plíce, Sněžka nabídla polský vítr a borůvkové knedlíky na boudě Růžohorky vrátily chuť do života!',
      safety:
        'Pozor na prudký poryvový vítr na hřebeni a vrcholu Sněžky. Kamenité serpentiny nad Slezským domem mohou po dešti klouzat. Na hřebeni není stín – v létě nepodceňujte pokrývku hlavy a dostatek tekutin.',
      highlights:
        'Obří důl, Kaplička v Obřím dole, historická vodárna, Slezský dům, Česká poštovna Anežka a borůvkové knedlíky na boudě Růžohorky.',
      gear: [
        'Kvalitní kotníková treková obuv',
        'Větruodolná bunda (softshell / hardshell)',
        'Teleskopické hůlky pro sestup',
        'Lékárnička a termoizolační fólie',
        '1.5 litru vody + energetická svačina',
      ],
      bestSeason: 'Červen až říjen (při stabilním letním nebo časném podzimním počasí).',
      weatherTips:
        'Vrchol Sněžky mívá až o 10°C méně než Pec pod Sněžkou. Doporučujeme vyrazit brzy ráno, než dorazí davy turistů z lanovky.',
      generatedAt: '2026-07-12T16:30:00.000Z',
    },
    peakCoords: {
      lat: 50.736,
      lng: 15.7396,
      name: 'Sněžka (1603 m)',
    },
    hutsAndWaypoints: ['Pec pod Sněžkou', 'Kaplička v Obřím dole', 'Slezský dům', 'Sněžka vrchol', 'Chata Růžohorky'],
    trackPoints: snezkaPoints,
    gpxRawXml: buildGPXXml('Sněžka přes Obří důl', snezkaPoints),
  },
  {
    id: 'hike-rysy-tatry',
    title: 'Rysy z Popradského plesa',
    mountainRange: 'Vysoké Tatry',
    date: '2026-08-20',
    distanceKm: 19.4,
    elevationGainM: 1280,
    elevationLossM: 1280,
    duration: '7h 45m',
    difficulty: 'hard',
    rating: 5,
    highestPointM: 2501,
    lowestPointM: 1350,
    weather: 'Slunečno, stabilní vysokohorské podmínky, 14°C',
    description:
      'Královská vysokohorská túra na nejvyšší přístupný vrchol Polska a jeden z nejkrásnějších výhledových štítů Slovenska. Výchozí bod Štrbské Pleso, pokračování k Popradskému plesu a Mengusovskou dolinou k Žabím plesům. Skalní úsek zajištěný řetězy a kovovými rošty. Návštěva nejvýše položené chaty na Slovensku – Chaty pod Rysmi (2250 m), kde nesmí chybět horský bylinkový čaj. Z vrcholu (2501 m) je dechberoucí panorama Mořského oka, Gerlachovského štítu a Vysoké.',
    photos: [
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=1200&q=80',
    ],
    videos: [
      {
        id: 'vid-rysy-1',
        url: 'https://www.youtube.com/watch?v=FjU_xYlZmag',
        title: 'Výstup Mengusovskou dolinou na Rysy a řetězy',
        platform: 'youtube',
      },
    ],
    aiSummary: {
      story:
        'Rysy patří k absolutním klenotům Vysokých Tater. Po průchodu kolem smaragdových Žabích ples se terén zvedá do strmého skalního prahu jištěného řetězy. V Chatě pod Rysmi ve výšce 2250 m panuje neopakovatelná atmosféra vysokohorských nosičů, a ze samotného vrcholu (2501 m) spatříte polské Mořské oko v hloubce přes kilometr pod vámi.',
      oneLiner: 'Řetězy studily, stehna pálila, ale bylinkový čaj na Chatě pod Rysmi a výhled na Mořské oko v 2500 m byl zkrátka čistý horský sen!',
      safety:
        'Vysokohorský terén vyžaduje jistý krok bez závratí. Na řetězech se tvoří fronty – udržujte rozestupy a nevstupujte do cesty padajícímu kamení. V případě náhlé bouřky ihned opusťte kovové řetězy a vrcholový hřeben!',
      highlights:
        'Popradské pleso, Žabie plesá, exponovaný úsek s řetězy, Chata pod Rysmi (nejvýše položená chata v Tatrách), Sedlo Váha a vrchol Rysů.',
      gear: [
        'Tuhá vysokohorská obuv s vibramovou podrážkou',
        'Nepromokavá bunda + teplá záložní vrstva',
        'Tenké rukavice (oceníte při kontaktu se studeným řetězem)',
        'Čelovka a plně nabitý telefon s aplikací HZS',
        '2 litry vody + jídlo na celý den',
      ],
      bestSeason: '15. červen až 31. říjen (platí přísná sezónní uzávěra TANAPu).',
      weatherTips:
        'Start nejpozději v 6:00 ráno ze Štrbského Plesa. Letní odpolední bouřky na hřebeni jsou extrémně nebezpečné.',
      generatedAt: '2026-08-20T17:15:00.000Z',
    },
    peakCoords: {
      lat: 49.1794,
      lng: 20.0881,
      name: 'Rysy (2501 m)',
    },
    hutsAndWaypoints: ['Štrbské Pleso', 'Popradské pleso', 'Žabie plesá', 'Chata pod Rysmi', 'Rysy vrchol'],
    trackPoints: rysyPoints,
    gpxRawXml: buildGPXXml('Rysy ve Vysokých Tatrách', rysyPoints),
  },
  {
    id: 'hike-praded-bila-opava',
    title: 'Praděd romantickým kaňonem Bílé Opavy',
    mountainRange: 'Jeseníky',
    date: '2026-09-05',
    distanceKm: 16.2,
    elevationGainM: 740,
    elevationLossM: 740,
    duration: '4h 45m',
    difficulty: 'moderate',
    rating: 5,
    highestPointM: 1491,
    lowestPointM: 800,
    weather: 'Polojasno, svěží vzduch v údolí, 15°C',
    description:
      'Pohádková túra jedním z nejkrásnějších horských kaňonů ve střední Evropě. Žlutá trasa podél Bílé Opavy vede po dřevěných lávkách, můstcích a schůdcích těsně nad hučícími peřejemi a velkým vodopádem. Po výstupu k chatě Barborka se otevírá hřeben Hrubého Jeseníku. Cesta vrcholí u ikonického 146 metrů vysokého televizního vysílače na Pradědu (1491 m). Z rozhledny je za dobré viditelnosti vidět až na Krkonoše, Beskydy i Malou Fatru.',
    photos: [
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1200&q=80',
    ],
    aiSummary: {
      story:
        'Divoká řeka Bílá Opava si razí cestu hlubokým skalním korytem v pralesovitém prostředí Jeseníků. Zvuk hučících kaskád vás doprovází po dřevěných lávkách až k mohutnému osmnáctimetrovému vodopádu. Po opuštění stinné rokle vystoupáte na otevřený vyhlídkový hřeben zakončený majestátním vysílačem na Pradědu.',
      oneLiner: 'Mokré lávky v Bílé Opavě prověřily rovnováhu, ale jesenická borůvková odměna na Barborce to všechno napravila!',
      safety:
        'Dřevěné lávky a kořeny v kaňonu Bílé Opavy jsou trvale vlhké od vodní tříště a mohou silně klouzat. Na žluté trase je jednosměrný provoz směrem nahoru, což doporučujeme striktně dodržovat.',
      highlights:
        'Lázně Karlova Studánka, Velký vodopád Bílé Opavy, peřeje, horská chata Barborka a rozhledna v televizním vysílači na Pradědu.',
      gear: [
        'Kotníkové boty s neklouzavou podrážkou',
        'Pláštěnka nebo nepromokavá bunda',
        'Náhradní suché ponožky v batohu',
        'Termoláhev s teplým čajem',
      ],
      bestSeason: 'Květen až říjen (na podzim hrají jesenické bučiny a smrčiny pestrými barvami).',
      weatherTips:
        'V kaňonu bývá citelně chladněji než na parkovišti. Naopak na vrcholu Pradědu často fouká prudký západní vítr.',
      generatedAt: '2026-09-05T18:00:00.000Z',
    },
    peakCoords: {
      lat: 50.0833,
      lng: 17.2311,
      name: 'Praděd (1491 m)',
    },
    hutsAndWaypoints: ['Karlova Studánka', 'Vodopády Bílé Opavy', 'Chata Barborka', 'Praděd vysílač', 'Ovčárna'],
    trackPoints: pradedPoints,
    gpxRawXml: buildGPXXml('Praděd z Karlovy Studánky', pradedPoints),
  },
  {
    id: 'hike-ferrata-martinske-hole',
    title: 'Ferrata HZS Martinské hole na Veľkou Lúku',
    mountainRange: 'Malá Fatra',
    date: '2026-08-08',
    distanceKm: 11.4,
    elevationGainM: 780,
    elevationLossM: 780,
    duration: '4h 30m',
    difficulty: 'ferrata',
    rating: 5,
    highestPointM: 1446,
    lowestPointM: 520,
    weather: 'Jasno, suchá skála, ideální ferratové podmínky, 21°C',
    description:
      'Fantastická zajištěná cesta (via ferrata) vedená divokou roklinou Pivovarského potoka v Lúčanské Malé Fatře. Začátek v Martině - Stráních. Trasa vede přímo korytem horského potoka přes ocelová lana, kramle a visutý lanový most. V horní části je možnost volby mezi variantou B (středně těžká) a C (exponovanější s kolmým výšvihem u vodopádu). Závěr ústí na loukách Martinských holí a pokračuje na vyhlídkový vrchol Veľká Lúka (1446 m).',
    photos: [
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    ],
    videos: [
      {
        id: 'vid-ferrata-1',
        url: 'https://www.youtube.com/watch?v=4T7k9m5-fC0',
        title: 'Průchod Ferratou HZS Martinské hole a visutý most',
        platform: 'youtube',
      },
    ],
    aiSummary: {
      story:
        'Ferrata HZS Martinské hole nabízí ryzí horské dobrodružství přímo v korytě šumícího Pivovarského potoka. Zajištěná ocelovým lanem stoupá strmým kaňonem, kde překonáváte vodopády po ocelových stupních a vzrušujících lanových lávkách. Vychutnáte si kombinaci lezení na pevné žule a osvěžující vodní tříště v srdci slovenské přírody.',
      oneLiner: 'Kousek železa ve skále, prázdno pod nohama na visutém mostě a nahoře na Veľké Lúce čistý pocit horského vítězství!',
      safety:
        'Přísně povinná certifikovaná ferratová výbava (úvazek, tlumič pádu, přilba). Na ferratu nikdy nevstupujte za deště nebo hrozících bouřek – ocelové lano v kaňonu je bleskosvod a skála je za mokra extrémně kluzká. Zákaz vstupu v době jarní uzávěry kvůli ochraně hnízdícího ptactva.',
      highlights:
        'Visutý lanový most přes roklinu, lezení přímo podél vodopádů, technická varianta C ve skalním zářezu, Chata na Martinských holiach a kruhový výhled z Veľké Lúky.',
      gear: [
        'Kompletní ferratový set s tlumičem pádu (EN 958:2017)',
        'Horolezecká přilba (ochrana proti padajícímu kamení)',
        'Sedací a prsní úvazek spojený plochou smyčkou',
        'Kožené ferratové rukavice bez prstů',
        'Lezecká nebo pevná nástupová obuv s lezeckou špičkou (climbing zone)',
      ],
      bestSeason: '1. červen až 15. září (a podzimní sezóna od 1. října do 15. listopadu).',
      weatherTips:
        'Před nástupem vždy ověřte průtok potoka a výstrahy Horské záchranné služby (HZS). Po větších deštích bývá kaňon zaplavený vodou.',
      generatedAt: '2026-08-08T15:00:00.000Z',
    },
    peakCoords: {
      lat: 49.108,
      lng: 18.818,
      name: 'Veľká Lúka (1446 m)',
    },
    hutsAndWaypoints: ['Martin Stráne', 'Nástup na ferratu', 'Lanový most', 'Vodopád (varianta B/C)', 'Chata Martinské hole', 'Veľká Lúka'],
    trackPoints: ferrataPoints,
    gpxRawXml: buildGPXXml('Ferrata HZS Martinské hole', ferrataPoints),
  },
];

const LOCAL_STORAGE_HIKES_KEY = 'horsky_denik_hikes_v1';

export function getStoredHikes(): MountainHike[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_HIKES_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_HIKES_KEY, JSON.stringify(SAMPLE_HIKES));
      return SAMPLE_HIKES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return SAMPLE_HIKES;
  } catch {
    return SAMPLE_HIKES;
  }
}

export function saveHikesToStorage(hikes: MountainHike[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_HIKES_KEY, JSON.stringify(hikes));
  } catch (err) {
    console.error('Failed to save hikes to localStorage', err);
  }
}

export function resetHikesToDefault(): MountainHike[] {
  localStorage.setItem(LOCAL_STORAGE_HIKES_KEY, JSON.stringify(SAMPLE_HIKES));
  return SAMPLE_HIKES;
}
