import { GenealogicalTree, TreeIndividual } from '../types/triangulation';
import { GenerationEstimate, MAX_GENERATIONS, parseYear } from './segmentAge';

/**
 * "Time + Space" for a triangulation group: once the genetic clock says roughly
 * which generation the shared ancestor lived in, look for where people in your
 * tree (and any matches' trees) lived at that time. Places where people with
 * different surnames converge are "neighbor effect" hotspots: likely places to
 * search for an ancestor who is not on paper (e.g. a misattributed parent).
 */

const GENERATION_YEARS = 30;

export interface LoadedTree {
  fileName: string;
  tree: GenealogicalTree;
}

/**
 * Who a loaded tree belongs to: 'home' (your own tree), a match's canonical name,
 * or '' when not linked to anyone (it then informs every group).
 */
export type TreeOwners = Record<string, string>;

/** Merges trees into one, prefixing IDs so the same @I1@ in two files cannot collide */
export const mergeTrees = (trees: LoadedTree[]): GenealogicalTree => ({
  individuals: trees.flatMap(({ fileName, tree }, index) =>
    tree.individuals.map(person => ({ ...person, id: `${index}:${person.id}`, sourceFile: fileName }))
  ),
  relationships: trees.flatMap(({ tree }, index) =>
    tree.relationships.map(rel => ({
      ...rel,
      id: `${index}:${rel.id}`,
      individual1: `${index}:${rel.individual1}`,
      individual2: `${index}:${rel.individual2}`
    }))
  )
});

export interface AncestorInfo {
  generation: number;
  /** Lineage path from you: P = father, M = mother (e.g. "PMP") */
  path: string;
}

/** Every ancestor of the home person, with how many generations back and through which line */
export const findAncestors = (tree: GenealogicalTree, homeId: string): Map<string, AncestorInfo> => {
  const parents = new Map<string, { id: string; role: 'P' | 'M' }[]>();
  for (const rel of tree.relationships) {
    if (rel.relationshipType !== 'parent-child') continue;
    if (!parents.has(rel.individual2)) parents.set(rel.individual2, []);
    parents.get(rel.individual2)!.push({ id: rel.individual1, role: rel.parentRole === 'mother' ? 'M' : 'P' });
  }

  const ancestors = new Map<string, AncestorInfo>();
  const queue: { id: string; generation: number; path: string }[] = [{ id: homeId, generation: 0, path: '' }];
  while (queue.length > 0) {
    const { id, generation, path } = queue.shift()!;
    for (const parent of parents.get(id) || []) {
      // Keep the shortest path (pedigree collapse can reach an ancestor twice)
      if (ancestors.has(parent.id) || parent.id === homeId) continue;
      const info = { generation: generation + 1, path: path + parent.role };
      ancestors.set(parent.id, info);
      queue.push({ id: parent.id, ...info });
    }
  }
  return ancestors;
};

/**
 * Normalizes a place to the county/state level so spellings line up:
 * "Gainesville, Allen, Kentucky, USA" and "Allen Co, Kentucky" both become "Allen, Kentucky".
 */
export const placeKey = (place: string): string | undefined => {
  const COUNTRIES = /^(usa|us|united states( of america)?|america|united|british)$/i;
  const parts = place
    .split(',')
    .map(part => part.trim().replace(/\s+(county|co\.?|parish)$/i, '').trim())
    // Drop countries and stray "Co"/"County" parts ("Allen, Co, Kentucky")
    .filter(part => part && !COUNTRIES.test(part) && !/^(county|co\.?|parish)$/i.test(part));
  if (parts.length === 0) return undefined;
  // County + state when there are enough parts, otherwise whatever is most specific
  return parts.slice(-2).join(', ');
};

export interface PlacePerson {
  person: TreeIndividual;
  generation?: number;
  path?: string;
  birthYear?: number;
  weight: number;
}

export interface Hotspot {
  place: string;
  /** Sum of the clock's probability for each person's generation */
  score: number;
  people: PlacePerson[];
  surnames: string[];
  sources: string[];
  fromYear?: number;
  toYear?: number;
  /** Two or more different surnames (or trees) converge here */
  neighborEffect: boolean;
}

export interface TimeSpaceResult {
  homeBirthYear?: number;
  /** Ancestors of the home person in the clock's 80% range (and on the group's line, if tagged) */
  candidates: PlacePerson[];
  hotspots: Hotspot[];
}

export const analyzeTimeSpace = (options: {
  estimate: GenerationEstimate;
  tree: GenealogicalTree;
  homeId?: string;
  groupLineage?: string;
  /** Canonical names of the group's members, to pick out their trees */
  memberNames: Set<string>;
  owners: TreeOwners;
}): TimeSpaceResult => {
  const { estimate, tree, homeId, groupLineage, memberNames, owners } = options;
  const home = homeId ? tree.individuals.find(person => person.id === homeId) : undefined;
  const homeBirthYear = parseYear(home?.birthDate);
  const ancestors = homeId ? findAncestors(tree, homeId) : new Map<string, AncestorInfo>();
  const homeFile = home?.sourceFile;

  const probability = (generation: number): number =>
    estimate.probabilities[Math.min(Math.max(generation, 1), MAX_GENERATIONS) - 1] ?? 0;

  const people: PlacePerson[] = [];
  for (const person of tree.individuals) {
    const birthYear = parseYear(person.birthDate);
    const ancestor = ancestors.get(person.id);
    const owner = person.sourceFile && person.sourceFile !== homeFile ? owners[person.sourceFile] ?? '' : 'home';

    let generation: number | undefined;
    if (ancestor) {
      // On the group's tagged line only (e.g. a PM group ignores Dad's father's side)
      if (groupLineage && !(ancestor.path.startsWith(groupLineage) || groupLineage.startsWith(ancestor.path))) continue;
      generation = ancestor.generation;
    } else if (owner === 'home') {
      continue; // Relatives in your tree who are not your ancestors cannot carry your segment
    } else if (owner && !memberNames.has(owner)) {
      continue; // A tree linked to a match who is not in this group
    } else if (birthYear !== undefined && homeBirthYear !== undefined) {
      // Someone in a match's tree: place them in time by birth year
      generation = Math.round((homeBirthYear - birthYear) / GENERATION_YEARS);
      if (generation < 1) continue;
    } else {
      continue;
    }

    const weight = probability(generation);
    if (weight <= 0) continue;
    people.push({ person, generation, path: ancestor?.path, birthYear, weight });
  }

  const candidates = people
    .filter(p => p.path !== undefined && p.generation! >= estimate.low && p.generation! <= estimate.high)
    .sort((a, b) => b.weight - a.weight || a.generation! - b.generation!);

  // Cluster the places of people inside the clock's 80% window, each person counted once per place
  const byPlace = new Map<string, PlacePerson[]>();
  for (const entry of people) {
    if (entry.generation! < estimate.low || entry.generation! > estimate.high) continue;
    const keys = new Set((entry.person.locations || []).map(placeKey).filter((key): key is string => !!key));
    for (const key of keys) {
      if (!byPlace.has(key)) byPlace.set(key, []);
      byPlace.get(key)!.push(entry);
    }
  }

  const hotspots: Hotspot[] = Array.from(byPlace.entries()).map(([place, entries]) => {
    const surnames = Array.from(new Set(entries.flatMap(e => e.person.surnames)));
    const sources = Array.from(new Set(entries.map(e => e.person.sourceFile || '')));
    const years = entries.map(e => e.birthYear).filter((y): y is number => y !== undefined);
    return {
      place,
      score: entries.reduce((sum, e) => sum + e.weight, 0),
      people: entries.sort((a, b) => b.weight - a.weight),
      surnames,
      sources,
      fromYear: years.length ? Math.min(...years) : undefined,
      toYear: years.length ? Math.max(...years) : undefined,
      neighborEffect: surnames.length >= 2 || sources.length >= 2
    };
  }).sort((a, b) => b.score - a.score);

  return { homeBirthYear, candidates, hotspots };
};
