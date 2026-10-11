/**
 * The "genetic clock": how many generations back a shared segment most likely
 * came from, estimated from its length.
 *
 * Model (Thomas et al. 1994; Huff et al. 2011, ERSA): along the path between two
 * relatives there are m meioses, and in each one a crossover happens about once
 * per 100 cM. A shared segment's length is therefore roughly exponential with
 * rate m/100 per cM. Two cousins descending from an ancestor G generations back
 * are separated by m = 2G meioses.
 *
 * Match lists only report segments above a threshold T (e.g. 7 cM). Because the
 * exponential is memoryless, a reported length L >= T has likelihood
 *   P(L | G) = (2G/100) * exp(-(2G/100) * (L - T))
 * With a flat prior over 1..MAX_GENERATIONS this gives a posterior over G. The
 * answer is a range, not an exact date: segment length varies a lot by chance.
 */

export const MAX_GENERATIONS = 15;

/** Typical years per generation, used to turn generations into birth years */
export const MIN_GENERATION_YEARS = 25;
export const MAX_GENERATION_YEARS = 35;

export interface GenerationEstimate {
  /** Most likely number of generations back from you to the shared ancestor */
  mostLikely: number;
  /** 80% credible range */
  low: number;
  high: number;
  /** Probability of each generation 1..MAX_GENERATIONS (index 0 = 1 generation back) */
  probabilities: number[];
}

export const estimateGenerations = (segmentCM: number, thresholdCM: number): GenerationEstimate => {
  const excess = Math.max(0, segmentCM - thresholdCM);
  const weights: number[] = [];
  for (let g = 1; g <= MAX_GENERATIONS; g++) {
    const rate = (2 * g) / 100;
    weights.push(rate * Math.exp(-rate * excess));
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  const posterior = weights.map(w => w / total);

  const mostLikely = posterior.indexOf(Math.max(...posterior)) + 1;

  // Smallest set of generations around the most likely one holding 80% of the probability
  let low = mostLikely;
  let high = mostLikely;
  let covered = posterior[mostLikely - 1];
  while (covered < 0.8) {
    const below = low > 1 ? posterior[low - 2] : -1;
    const above = high < MAX_GENERATIONS ? posterior[high] : -1;
    if (below < 0 && above < 0) break;
    if (below >= above) {
      low--;
      covered += below;
    } else {
      high++;
      covered += above;
    }
  }

  return { mostLikely, low, high, probabilities: posterior };
};

/** 1 = parent, 2 = grandparent, 3 = great-grandparent, 4 = 2nd great-grandparent, ... */
export const ancestorLabel = (generations: number): string => {
  if (generations <= 1) return 'parent';
  if (generations === 2) return 'grandparent';
  if (generations === 3) return 'great-grandparent';
  const n = generations - 2;
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix} great-grandparent`;
};

/** Birth years the shared ancestor most plausibly falls in, given your birth year */
export const ancestorBirthWindow = (homeBirthYear: number, estimate: GenerationEstimate): { from: number; to: number } => ({
  from: homeBirthYear - estimate.high * MAX_GENERATION_YEARS,
  to: homeBirthYear - estimate.low * MIN_GENERATION_YEARS
});

/** First four-digit year in a GEDCOM date such as "ABT 1820", "10 May 1998" or "BET 1790 AND 1795" */
export const parseYear = (date: string | undefined): number | undefined => {
  const match = date?.match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : undefined;
};
