import { describe, expect, it } from 'vitest';
import {
  deduplicateAndMergeMatches,
  findTriangulations,
  parseChromosome,
  parseMatchesFromCSV
} from '../triangulationEngine';
import { parseCSVText } from '../csvParser';
import { DNAMatch, TriangulationSettings } from '../../types/triangulation';

const settings: TriangulationSettings = {
  minimumSize: 7,
  minimumMatches: 3,
  overlapThreshold: 0.5,
  enableRelationshipPrediction: false,
  enableConfidenceScoring: false,
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
    // Bob and Carol each overlap Alice, but not each other
    const groups = findTriangulations([
      segment('Alice', 0, 1000),
      segment('Bob', 0, 500),
      segment('Carol', 500, 1000),
      segment('Dave', 100, 450)
    ], settings);

    expect(groups).toHaveLength(1);
    expect(groups[0].matches.map(m => m.matchName)).toEqual(['Alice', 'Bob', 'Dave']);
    expect(groups[0]).toMatchObject({ startPosition: 100, endPosition: 450 });
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
