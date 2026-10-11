import { describe, expect, it } from 'vitest';
import { ancestorBirthWindow, ancestorLabel, estimateGenerations, parseYear } from '../segmentAge';
import { analyzeTimeSpace, findAncestors, mergeTrees, placeKey } from '../timeSpace';
import { parseGEDCOMText } from '../gedcomParser';

describe('genetic clock', () => {
  it('points further back for shorter segments', () => {
    const long = estimateGenerations(40, 7);
    const medium = estimateGenerations(20, 7);
    const short = estimateGenerations(12, 7);
    expect(long.mostLikely).toBeLessThan(medium.mostLikely);
    expect(medium.mostLikely).toBeLessThan(short.mostLikely);
    // 2G/100 = 1/(L - T) at the peak: 20 cM above a 7 cM threshold -> ~4 generations
    expect(medium.mostLikely).toBe(4);
  });

  it('returns a probability for every generation and an 80% range around the peak', () => {
    const estimate = estimateGenerations(20, 7);
    expect(estimate.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(estimate.low).toBeLessThanOrEqual(estimate.mostLikely);
    expect(estimate.high).toBeGreaterThanOrEqual(estimate.mostLikely);
    const inRange = estimate.probabilities.slice(estimate.low - 1, estimate.high).reduce((a, b) => a + b, 0);
    expect(inRange).toBeGreaterThanOrEqual(0.8);
  });

  it('labels generations and birth windows', () => {
    expect(ancestorLabel(2)).toBe('grandparent');
    expect(ancestorLabel(4)).toBe('2nd great-grandparent');
    expect(ancestorLabel(13)).toBe('11th great-grandparent');
    expect(ancestorBirthWindow(1990, { mostLikely: 4, low: 3, high: 5, probabilities: [] })).toEqual({ from: 1815, to: 1915 });
    expect(parseYear('ABT 1820')).toBe(1820);
    expect(parseYear('10 May 1998')).toBe(1998);
    expect(parseYear(undefined)).toBeUndefined();
  });
});

describe('places', () => {
  it('normalizes places to county and state', () => {
    expect(placeKey('Gainesville,,Allen,Kentucky,USA')).toBe('Allen, Kentucky');
    expect(placeKey('Barren County, Kentucky, USA')).toBe('Barren, Kentucky');
    expect(placeKey('Isleworth, Middlesex, England')).toBe('Middlesex, England');
    expect(placeKey('Allen,Co,Kentucky,USA')).toBe('Allen, Kentucky');
    expect(placeKey(' , ')).toBeUndefined();
  });
});

const HOME_TREE = [
  '0 @I1@ INDI', '1 NAME Me /Carter/', '1 SEX M', '1 BIRT', '2 DATE 1990',
  '0 @I2@ INDI', '1 NAME Dad /Carter/', '1 SEX M', '1 BIRT', '2 DATE 1960',
  '0 @I3@ INDI', '1 NAME Mom /Ellis/', '1 SEX F', '1 BIRT', '2 DATE 1962', '2 PLAC Dayton, Montgomery, Ohio, USA',
  '0 @I4@ INDI', '1 NAME Grandpa /Carter/', '1 SEX M', '1 BIRT', '2 DATE 1930', '2 PLAC Glasgow, Barren, Kentucky, USA',
  '0 @I5@ INDI', '1 NAME Grandma /Shaw/', '1 SEX F', '1 BIRT', '2 DATE 1932', '2 PLAC Barren County, Kentucky, USA',
  '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I3@', '1 CHIL @I1@',
  '0 @F2@ FAM', '1 HUSB @I4@', '1 WIFE @I5@', '1 CHIL @I2@',
  '0 TRLR'
].join('\r');

const MATCH_TREE = [
  '0 @I1@ INDI', '1 NAME Ann /Todd/', '1 BIRT', '2 DATE 1985',
  '0 @I2@ INDI', '1 NAME Old /Todd/', '1 BIRT', '2 DATE 1928', '2 PLAC Tracy, Barren, Kentucky, USA',
  '0 TRLR'
].join('\n');

describe('time + place analysis', () => {
  const tree = mergeTrees([
    { fileName: 'mine.ged', tree: parseGEDCOMText(HOME_TREE) },
    { fileName: 'ann.ged', tree: parseGEDCOMText(MATCH_TREE) }
  ]);

  it('keeps IDs from different files apart', () => {
    expect(new Set(tree.individuals.map(p => p.id)).size).toBe(tree.individuals.length);
  });

  it('finds ancestors with their generation and line', () => {
    const ancestors = findAncestors(tree, '0:@I1@');
    expect(ancestors.get('0:@I2@')).toEqual({ generation: 1, path: 'P' });
    expect(ancestors.get('0:@I3@')).toEqual({ generation: 1, path: 'M' });
    expect(ancestors.get('0:@I5@')).toEqual({ generation: 2, path: 'PM' });
  });

  it('finds where different surnames converge in the clock window', () => {
    // A clock peaking at 2 generations (grandparents)
    const estimate = { mostLikely: 2, low: 2, high: 3, probabilities: [0.1, 0.6, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const result = analyzeTimeSpace({ estimate, tree, homeId: '0:@I1@', memberNames: new Set(['ann todd']), owners: { 'ann.ged': 'ann todd' } });

    expect(result.homeBirthYear).toBe(1990);
    expect(result.candidates.map(c => c.person.name)).toEqual(['Grandpa Carter', 'Grandma Shaw']);
    const top = result.hotspots[0];
    expect(top.place).toBe('Barren, Kentucky');
    expect(top.people.map(p => p.person.name).sort()).toEqual(['Grandma Shaw', 'Grandpa Carter', 'Old Todd']);
    expect(top.neighborEffect).toBe(true);
    expect(top.sources).toHaveLength(2);
  });

  it('only uses the group line and trees of the group\'s members', () => {
    const estimate = { mostLikely: 2, low: 2, high: 3, probabilities: [0.1, 0.6, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const result = analyzeTimeSpace({
      estimate, tree, homeId: '0:@I1@', groupLineage: 'PM',
      memberNames: new Set(['someone else']), owners: { 'ann.ged': 'ann todd' }
    });
    expect(result.candidates.map(c => c.person.name)).toEqual(['Grandma Shaw']);
    expect(result.hotspots.flatMap(h => h.people.map(p => p.person.name))).not.toContain('Old Todd');
  });
});
