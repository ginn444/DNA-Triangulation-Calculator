import { describe, expect, it } from 'vitest';
import {
  deduplicateAndMergeMatches,
  buildTriangulationGroups,
  findTriangulations,
  parseChromosome,
  parseMatchesFromCSV
} from '../triangulationEngine';
import { parseCSVText } from '../csvParser';
import { DNAMatch, TriangulationSettings } from '../../types/triangulation';

const settings: TriangulationSettings = {
  minimumSize: 7,
  minimumMatches: 3,
  minimumOverlapCM: 7,
  enableRelationshipPrediction: false,
  enableCrossVerification: false,
  separateByLineage: true,
  maxResultsPerPage: 25
};

const segment = (matchName: string, startPosition: number, endPosition: number, chromosome = 7): DNAMatch & { sourceFile: string } => ({
  matchName,
  chromosome,
  startPosition,
  endPosition,
  sizeCM: 15,
  sourceFile: 'test.csv'
});

describe('parseChromosome', () => {
  it('parses numeric and X chromosome values', () => {
    expect(parseChromosome('7')).toBe(7);
    expect(parseChromosome(' chr12 ')).toBe(12);
    expect(parseChromosome('X')).toBe(23);
    expect(parseChromosome('chrX')).toBe(23);
    expect(parseChromosome('Y')).toBeNaN();
    expect(parseChromosome(undefined)).toBeNaN();
  });
});

describe('parseCSVText', () => {
  it('maps headers in Windows (CRLF) files with a byte order mark', () => {
    const text = '﻿Name,Chromosome,Start Location,End Location,Overlap cM\r\n' +
      'Jane Doe,X,1000000,9000000,12.5\r\n';
    const rows = parseCSVText(text, 'test.csv');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      matchName: 'Jane Doe',
      chromosome: 'X',
      startPosition: '1000000',
      endPosition: '9000000',
      sizeCM: '12.5'
    });

    const { matches } = parseMatchesFromCSV(rows, 'test.csv', settings);
    expect(matches).toHaveLength(1);
    expect(matches[0].chromosome).toBe(23);
    expect(matches[0].sizeCM).toBe(12.5);
  });
});

describe('deduplicateAndMergeMatches', () => {
  it('drops the same segment exported in more than one file', () => {
    const merged = deduplicateAndMergeMatches([
      { ...segment('Jane Doe', 100, 900), sourceFile: 'a.csv' },
      { ...segment('Doe, Jane', 100, 900), sourceFile: 'b.csv' },
      { ...segment('Jane Doe', 2000, 3000), sourceFile: 'b.csv' }
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.every(m => m.matchName === 'Jane Doe')).toBe(true);
  });
});

describe('findTriangulations', () => {
  it('groups three people who share a segment', () => {
    const groups = findTriangulations([
      segment('Alice', 100, 1000),
      segment('Bob', 200, 1100),
      segment('Carol', 300, 900)
    ], settings);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 0, startPosition: 300, endPosition: 900 });
    expect(groups[0].matches.map(m => m.matchName)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('does not count one person twice toward the minimum', () => {
    const groups = findTriangulations([
      segment('Alice', 100, 1000),
      segment('Alice', 150, 950),
      segment('Bob', 200, 1100)
    ], settings);

    expect(groups).toHaveLength(0);
  });

  it('only adds members that overlap the region shared by the whole group', () => {
    // ~1 cM per Mb. Bob and Carol each overlap Alice, but barely overlap each other
    const mb = (matchName: string, startMb: number, endMb: number): DNAMatch & { sourceFile: string } => ({
      ...segment(matchName, startMb * 1e6, endMb * 1e6), sizeCM: endMb - startMb
    });
    const groups = findTriangulations([
      mb('Alice', 0, 20),
      mb('Bob', 0, 12),
      mb('Carol', 10, 20),
      mb('Dave', 1, 12)
    ], settings);

    expect(groups).toHaveLength(1);
    expect(groups[0].matches.map(m => m.matchName)).toEqual(['Alice', 'Bob', 'Dave']);
    expect(groups[0]).toMatchObject({ startPosition: 1e6, endPosition: 12e6, sharedCM: 11 });
  });

  it('assigns ids in display order', () => {
    const groups = findTriangulations([
      segment('Alice', 100, 1000, 9),
      segment('Bob', 200, 1100, 9),
      segment('Carol', 300, 900, 9),
      segment('Alice', 100, 1000, 2),
      segment('Bob', 200, 1100, 2),
      segment('Carol', 300, 900, 2)
    ], settings);

    expect(groups.map(g => [g.id, g.chromosome])).toEqual([[0, 2], [1, 9]]);
  });
});

describe('relationship prediction', () => {
  const predictSettings = { ...settings, enableRelationshipPrediction: true };

  it('predicts from each person\'s own total, not the group\'s combined cM', () => {
    // 100 people each sharing one 20 cM segment: 2,000 cM combined, but every one is a distant cousin
    const people = Array.from({ length: 100 }, (_, i) => ({ ...segment(`Cousin ${i}`, 100 + i, 1000), sizeCM: 20 }));
    const groups = buildTriangulationGroups(people, predictSettings);

    expect(groups).toHaveLength(1);
    expect(groups[0].relationshipPrediction?.relationship).toMatch(/Cousin/);
    expect(groups[0].relationshipPrediction?.relationship).not.toMatch(/Sibling|Grandparent|Parent/);
    expect(groups[0].matches[0].totalSharedCM).toBe(20);
  });

  it('adds up all of a person\'s segments, including other chromosomes', () => {
    const groups = buildTriangulationGroups([
      { ...segment('Alice', 100, 1000), sizeCM: 30 },
      { ...segment('Alice', 100, 1000, 3), sizeCM: 40 },
      segment('Bob', 200, 1100),
      segment('Carol', 300, 900)
    ], predictSettings);

    const alice = groups[0].matches.find(m => m.matchName === 'Alice');
    expect(alice?.totalSharedCM).toBe(70);
  });
});

describe('scientific triangulation rules', () => {
  // ~1 cM per Mb
  const seg = (matchName: string, startMb: number, endMb: number, chromosome = 7): DNAMatch => ({
    matchName, chromosome, startPosition: startMb * 1e6, endPosition: endMb * 1e6, sizeCM: endMb - startMb
  });

  it('never lets the shared stretch shrink below the minimum cM', () => {
    // Staggered 10 cM segments: all five overlap, but together they share only 6 cM
    const groups = buildTriangulationGroups([
      seg('A', 0, 10), seg('B', 1, 11), seg('C', 2, 12), seg('D', 3, 13), seg('E', 4, 14)
    ], settings);

    for (const group of groups) {
      expect(group.sharedCM).toBeGreaterThanOrEqual(7);
      expect(group.endPosition - group.startPosition).toBeGreaterThanOrEqual(7e6);
    }
    // E would shrink the shared stretch to 6 cM, so it is left out
    expect(groups).toHaveLength(1);
    expect(groups[0].matches.map(m => m.matchName)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ignores segments smaller than the minimum shared stretch', () => {
    const groups = buildTriangulationGroups([seg('A', 0, 6), seg('B', 0, 6), seg('C', 0, 6)], { ...settings, minimumSize: 5 });
    expect(groups).toHaveLength(0);
  });

  it('rates a group by the size of the stretch everyone shares', () => {
    const strong = buildTriangulationGroups([seg('A', 0, 20), seg('B', 1, 21), seg('C', 2, 22)], settings);
    const moderate = buildTriangulationGroups([seg('A', 0, 10), seg('B', 1, 11), seg('C', 2, 12)], settings);
    expect(strong[0]).toMatchObject({ evidence: 'strong', sharedCM: 18 });
    expect(moderate[0]).toMatchObject({ evidence: 'moderate', sharedCM: 8 });
  });

  it('flags stretches where unusually many matches share DNA as possible pile-ups', () => {
    const background = Array.from({ length: 40 }, (_, i) => seg(`Bg ${i}`, 10 + i * 3, 18 + i * 3, 1 + (i % 22)));
    const crowd = Array.from({ length: 30 }, (_, i) => seg(`Crowd ${i}`, 50 + (i % 3) * 0.1, 60));
    const family = [seg('Ann', 150, 170, 9), seg('Ben', 151, 171, 9), seg('Cat', 152, 172, 9)];
    const groups = buildTriangulationGroups([...background, ...crowd, ...family], settings);

    const crowdGroup = groups.find(g => g.matches.some(m => m.matchName.startsWith('Crowd')));
    const familyGroup = groups.find(g => g.matches.some(m => m.matchName === 'Ann'));
    expect(crowdGroup?.evidence).toBe('pile-up');
    expect(crowdGroup?.regionMatchCount).toBeGreaterThanOrEqual(30);
    expect(familyGroup?.evidence).toBe('strong');
  });

  it('keeps a strong family cluster intact when weaker overlaps are nearby', () => {
    // Five cousins share ~20 cM; three unrelated matches overlap only part of it
    const cousins = ['Ann', 'Ben', 'Cal', 'Dee', 'Eve'].map((n, i) => seg(n, 60 + i * 0.5, 82 + i * 0.3, 11));
    const partial = [seg('X', 50, 73, 11), seg('Y', 70, 95, 11), seg('Z', 55, 75, 11)];
    const groups = buildTriangulationGroups([...partial, ...cousins], settings);

    const family = groups.find(g => g.matches.some(m => m.matchName === 'Ann'));
    expect(family?.matches.map(m => m.matchName).sort()).toEqual(['Ann', 'Ben', 'Cal', 'Dee', 'Eve']);
    expect(family?.sharedCM).toBeGreaterThanOrEqual(19);
    expect(family?.evidence).toBe('strong');
  });
});
