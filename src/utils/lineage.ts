import { DNAMatch } from '../types/triangulation';

/**
 * A lineage is a path up the family tree written as P (father) and M (mother),
 * read from you outwards: "P" = your father's side, "PM" = your father's mother,
 * "PMP" = your father's mother's father.
 */
export const MAX_LINEAGE_DEPTH = 4;

const LINEAGE_PATTERN = new RegExp(`^[PM]{1,${MAX_LINEAGE_DEPTH}}$`);

export const isValidLineage = (value: string | undefined): value is string =>
  !!value && LINEAGE_PATTERN.test(value);

/** Every lineage up to MAX_LINEAGE_DEPTH, grouped by generation (P/M, then PP/PM/MP/MM, ...). */
export const LINEAGE_OPTIONS: string[][] = (() => {
  const generations: string[][] = [['P', 'M']];
  for (let depth = 1; depth < MAX_LINEAGE_DEPTH; depth++) {
    generations.push(generations[depth - 1].flatMap(path => [`${path}P`, `${path}M`]));
  }
  return generations;
})();

/** "PMP" -> "Dad's mom's dad" */
export const describeLineage = (path: string): string =>
  path
    .split('')
    .map((step, index) => {
      const person = step === 'P' ? 'dad' : 'mom';
      const word = index === path.length - 1 ? person : `${person}'s`;
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(' ');

/**
 * Converts a value from a CSV "Lineage" column into a lineage path.
 * Accepts paths ("PPM", "P-P-M", "p p m") and the words paternal/maternal,
 * father/mother, dad/mom.
 */
export const normalizeLineage = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;

  if (/^(paternal|father|father's side|dad|dad's side)$/.test(value)) return 'P';
  if (/^(maternal|mother|mother's side|mom|mom's side|mum)$/.test(value)) return 'M';

  const path = value.replace(/[\s\-_>/.]+/g, '').toUpperCase();
  return isValidLineage(path) ? path : undefined;
};

/**
 * Two lineages are compatible when one is an ancestor path of the other:
 * "PP" and "PPM" can both be true of the same segment, "PP" and "PM" cannot.
 */
export const lineagesCompatible = (a: string, b: string): boolean =>
  a.startsWith(b) || b.startsWith(a);

/** The more specific of two compatible lineages. */
export const mergeLineages = (a: string | undefined, b: string | undefined): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
};

/**
 * Summarises the tagged members of a group: the most specific lineage they all
 * agree on, or a conflict when two members point to different branches.
 */
export const summarizeLineage = (matches: DNAMatch[]): { lineage?: string; conflict: boolean } => {
  let lineage: string | undefined;
  for (const match of matches) {
    if (!match.lineage) continue;
    if (lineage && !lineagesCompatible(lineage, match.lineage)) {
      return { lineage: undefined, conflict: true };
    }
    lineage = mergeLineages(lineage, match.lineage);
  }
  return { lineage, conflict: false };
};

/**
 * X-DNA is never passed from father to son, so an X segment cannot come
 * through any father's father (a "PP" anywhere in the path).
 */
export const lineageImpossibleOnX = (path: string | undefined): boolean =>
  !!path && path.includes('PP');
