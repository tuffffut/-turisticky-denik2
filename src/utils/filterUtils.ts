import { MountainHike, HikeFilterState } from '../types';
import { getDateTimestamp } from './dateUtils';

export const DEFAULT_FILTER_STATE: HikeFilterState = {
  searchQuery: '',
  year: 'all',
  month: 'all',
  mountainRange: 'all',
  activityType: 'all',
  difficulty: 'all',
  sortBy: 'date-desc',
};

export const CZECH_MONTHS = [
  { month: 1, name: 'Leden', short: 'Led' },
  { month: 2, name: 'Únor', short: 'Úno' },
  { month: 3, name: 'Březen', short: 'Bře' },
  { month: 4, name: 'Duben', short: 'Dub' },
  { month: 5, name: 'Květen', short: 'Kvě' },
  { month: 6, name: 'Červen', short: 'Čvn' },
  { month: 7, name: 'Červenec', short: 'Čvc' },
  { month: 8, name: 'Srpen', short: 'Srp' },
  { month: 9, name: 'Září', short: 'Zář' },
  { month: 10, name: 'Říjen', short: 'Říj' },
  { month: 11, name: 'Listopad', short: 'Lis' },
  { month: 12, name: 'Prosinec', short: 'Pro' },
];

export function countActiveFilters(filters: HikeFilterState): number {
  let count = 0;
  if (filters.searchQuery.trim()) count++;
  if (filters.year !== 'all') count++;
  if (filters.month !== 'all') count++;
  if (filters.mountainRange !== 'all') count++;
  if (filters.activityType !== 'all') count++;
  if (filters.difficulty !== 'all') count++;
  return count;
}

export function filterAndSortHikes(
  hikes: MountainHike[],
  filters: HikeFilterState
): MountainHike[] {
  let result = [...hikes];

  // 1. Fulltext Search
  if (filters.searchQuery.trim()) {
    const q = filters.searchQuery.toLowerCase().trim();
    result = result.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        h.mountainRange.toLowerCase().includes(q) ||
        (h.description && h.description.toLowerCase().includes(q)) ||
        (h.weather && h.weather.toLowerCase().includes(q))
    );
  }

  // 2. Year filter
  if (filters.year !== 'all') {
    result = result.filter((h) => h.date && h.date.startsWith(filters.year));
  }

  // 3. Month filter
  if (filters.month !== 'all') {
    const targetMonth = parseInt(filters.month, 10);
    result = result.filter((h) => {
      if (!h.date || h.date.length < 7) return false;
      const m = parseInt(h.date.slice(5, 7), 10);
      return m === targetMonth;
    });
  }

  // 4. Mountain Range
  if (filters.mountainRange !== 'all') {
    result = result.filter((h) => h.mountainRange === filters.mountainRange);
  }

  // 5. Activity Type
  if (filters.activityType !== 'all') {
    if (filters.activityType === 'climbing') {
      result = result.filter(
        (h) =>
          h.activityType === 'climbing' ||
          h.activityType === 'mountaineering' ||
          h.difficulty === 'climbing'
      );
    } else if (filters.activityType === 'ferrata') {
      result = result.filter(
        (h) =>
          h.difficulty === 'ferrata' ||
          h.title.toLowerCase().includes('ferrat') ||
          h.title.toLowerCase().includes('klettersteig')
      );
    } else if (filters.activityType === 'hiking') {
      result = result.filter(
        (h) =>
          h.activityType === 'hiking' ||
          (!h.activityType && h.difficulty !== 'climbing')
      );
    }
  }

  // 6. Difficulty
  if (filters.difficulty === 'unspecified') {
    result = result.filter((h) => !h.difficulty);
  } else if (filters.difficulty !== 'all') {
    result = result.filter((h) => h.difficulty === filters.difficulty);
  }

  // 7. Sorting
  result.sort((a, b) => {
    switch (filters.sortBy) {
      case 'date-desc':
        return getDateTimestamp(b.date) - getDateTimestamp(a.date);
      case 'date-asc':
        return getDateTimestamp(a.date) - getDateTimestamp(b.date);
      case 'dist-desc':
        return b.distanceKm - a.distanceKm;
      case 'ele-desc':
        return b.elevationGainM - a.elevationGainM;
      case 'rating-desc':
        return (b.rating || 0) - (a.rating || 0);
      default:
        return 0;
    }
  });

  return result;
}

export function getAvailableFilterOptions(
  hikes: MountainHike[],
  currentFilters?: HikeFilterState
) {
  // Years with count
  const yearCounts = new Map<string, number>();
  // Mountain ranges with count
  const rangeCounts = new Map<string, number>();
  // Months with count
  const monthCounts = new Map<number, number>();
  // Activities with count
  let hikingCount = 0;
  let climbingCount = 0;
  let ferrataCount = 0;

  hikes.forEach((h) => {
    // Year
    if (h.date && h.date.length >= 4) {
      const yr = h.date.slice(0, 4);
      if (/^\d{4}$/.test(yr)) {
        yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);
      }
    }

    // Month
    if (h.date && h.date.length >= 7) {
      const m = parseInt(h.date.slice(5, 7), 10);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
      }
    }

    // Mountain Range
    const range = h.mountainRange || 'Neznámé pohoří';
    rangeCounts.set(range, (rangeCounts.get(range) || 0) + 1);

    // Activity
    const isClimb =
      h.activityType === 'climbing' ||
      h.activityType === 'mountaineering' ||
      h.difficulty === 'climbing';
    const isFerrata =
      h.difficulty === 'ferrata' ||
      h.title.toLowerCase().includes('ferrat') ||
      h.title.toLowerCase().includes('klettersteig');

    if (isClimb) climbingCount++;
    else if (isFerrata) ferrataCount++;
    else hikingCount++;
  });

  // Sort years descending
  const years = Array.from(yearCounts.entries())
    .sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))
    .map(([year, count]) => ({ year, count }));

  // Sort mountain ranges by count descending
  const mountainRanges = Array.from(rangeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([range, count]) => ({ range, count }));

  // Months
  const months = CZECH_MONTHS.map((cm) => ({
    month: cm.month,
    name: cm.name,
    short: cm.short,
    count: monthCounts.get(cm.month) || 0,
  }));

  const activities = [
    { type: 'hiking', label: '🥾 Pěší turistika', count: hikingCount },
    { type: 'climbing', label: '🧗 Lezení a horolezectví', count: climbingCount },
    { type: 'ferrata', label: '🪢 Via Ferrata', count: ferrataCount },
  ];

  return {
    years,
    months,
    mountainRanges,
    activities,
  };
}
