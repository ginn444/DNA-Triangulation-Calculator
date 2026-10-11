import { describe, expect, it } from 'vitest';
import {
  LINEAGE_OPTIONS,
  describeLineage,
  lineageImpossibleOnX,
  lineagesCompatible,
  normalizeLineage,
  summarizeLineage
} from '../lineage';
import { buildTriangulationGroups, parseMatchesFromCSV } from '../triangulationEngine';
import { parseCSVText } from '../csvParser';
import { DNAMatch, TriangulationSettings } from '../../types/triangulation';

const settings: TriangulationSettings = {
  minimumSize: 7,
  minimumMatches: 3,
  minimumOverlapCM: 7,
  boundaryToleranceBp: 0,
  enableRelationshipPrediction: false,
  enableCrossVerification: false,
  separateByLineage: true,
  maxResultsPerPage: 25
};

const segment = (matchName: string, startPosition: number, endPosition: number, lineage?: string): DNAMatch => ({
  matchName,
  chromosome: 7,
  startPosition,
  endPosition,
  sizeCM: 15,
  lineage
});

describe('lineage helpers', () => {
  it('lists every path up to four generations', () => {
    expect(LINEAGE_OPTIONS.map(g => g.length)).toEqual([2, 4, 8, 16]);
    expect(LINEAGE_OPTIONS[1]).toEqual(['PP', 'PM', 'MP', 'MM']);
  });

  it('describes paths in plain words', () => {
    expect(describeLineage('P')).toBe('Dad');
    expect(describeLineage('PMP')).toBe("Dad's mom's dad");
  });

  it('normalizes CSV values', () => {
    expect(normalizeLineage('Paternal')).toBe('P');
    expect(normalizeLineage('maternal')).toBe('M');
    expect(normalizeLineage('p-p-m')).toBe('PPM');
    expect(normalizeLineage('PPMPP')).toBeUndefined();
    expect(normalizeLineage('unknown')).toBeUndefined();
  });

  it('treats a path and its deeper branches as compatible', () => {
    expect(lineagesCompatible('PP', 'PPM')).toBe(true);
    expect(lineagesCompatible('P', 'PMM')).toBe(true);
    expect(lineagesCompatible('PP', 'PM')).toBe(false);
    expect(lineagesCompatible('P', 'M')).toBe(false);
  });

  it('summarizes a group to its most specific shared lineage', () => {
    expect(summarizeLineage([segment('A', 0, 1, 'P'), segment('B', 0, 1, 'PPM'), segment('C', 0, 1)]))
      .toEqual({ lineage: 'PPM', conflict: false });
    expect(summarizeLineage([segment('A', 0, 1, 'PP'), segment('B', 0, 1, 'PM')]))
      .toEqual({ lineage: undefined, conflict: true });
  });

  it('flags X lineages through a father\'s father', () => {
    expect(lineageImpossibleOnX('PM')).toBe(false);
    expect(lineageImpossibleOnX('MPM')).toBe(false);
    expect(lineageImpossibleOnX('PP')).toBe(true);
    expect(lineageImpossibleOnX('MPP')).toBe(true);
  });
});

describe('lineage-aware triangulation', () => {
  // Dad's-dad cousins and Dad's-mom cousins land on the same spot (different copies of chromosome 7)
  const matches = [
    segment('Paul', 100, 1000, 'PP'),
    segment('Mary', 150, 1000, 'PM'),
    segment('Pete', 200, 1000),
    segment('Molly', 250, 1000),
    segment('Pat', 300, 1000, 'PPP'),
    segment('Meg', 350, 1000, 'PM'),
    segment('Mona', 400, 1000, 'PM')
  ];

  it('keeps conflicting branches in separate groups', () => {
    const groups = buildTriangulationGroups([...matches, segment('Pia', 320, 1000, 'PPP')], settings);
    const groupOf = (name: string) => groups.find(g => g.matches.some(m => m.matchName === name));

    expect(groups).toHaveLength(2);
    expect(groups.every(g => !g.lineageConflict)).toBe(true);
    // Tagged members stay with their own branch; untagged ones may join either
    expect(groupOf('Paul')).toBe(groupOf('Pat'));
    expect(groupOf('Paul')).toBe(groupOf('Pia'));
    expect(groupOf('Mary')).toBe(groupOf('Meg'));
    expect(groupOf('Mary')).toBe(groupOf('Mona'));
    expect(groupOf('Paul')?.lineage).toBe('PPP');
    expect(groupOf('Mary')?.lineage).toBe('PM');
  });

  it('marks a mixed group as a conflict when separation is off', () => {
    const groups = buildTriangulationGroups(matches, { ...settings, separateByLineage: false });
    expect(groups).toHaveLength(1);
    expect(groups[0].lineageConflict).toBe(true);
    expect(groups[0].lineage).toBeUndefined();
  });

  it('lets user tags override and clear CSV lineages', () => {
    const groups = buildTriangulationGroups(matches, settings, { mary: 'PP', meg: '', mona: '' });
    expect(groups).toHaveLength(1);
    expect(groups[0].lineage).toBe('PPP');
    expect(groups[0].matches).toHaveLength(7);
    expect(groups[0].matches.find(m => m.matchName === 'Meg')?.lineage).toBeUndefined();
  });

  it('reads a Lineage column from the CSV', () => {
    const rows = parseCSVText('Name,Chromosome,Start Location,End Location,Overlap cM,Lineage\nJane,7,100,900,12,Paternal\n', 'test.csv');
    const { matches: parsed } = parseMatchesFromCSV(rows, 'test.csv', settings);
    expect(parsed[0].lineage).toBe('P');
  });
});
