import { describe, expect, it } from 'vitest';
import { parseGEDCOMText } from '../gedcomParser';
import { buildTriangulationGroups } from '../triangulationEngine';
import { DNAMatch, TriangulationSettings } from '../../types/triangulation';

const GEDCOM_LINES = [
  '0 HEAD',
  '1 SOUR TestApp',
  '0 @P1@ INDI',
  '1 NAME John Henry /Carter/',
  '2 GIVN John Henry',
  '1 BIRT',
  '2 DATE 4 Mar 1820',
  '2 PLAC Springfield,,Greene,Missouri,USA',
  '1 DEAT',
  '2 DATE 1 Jan 1890',
  '0 @P2@ INDI',
  '1 NAME Mary /Ellis/',
  '1 NAME Mary /Carter/',
  '0 @P3@ INDI',
  '1 NAME Sam /Carter/',
  '0 @F1@ FAM',
  '1 HUSB @P1@',
  '1 WIFE @P2@',
  '1 CHIL @P3@',
  '0 TRLR'
];

describe('parseGEDCOMText', () => {
  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR-only (MacFamilyTree)', '\r']
  ])('reads %s line endings', (_, eol) => {
    const tree = parseGEDCOMText('﻿' + GEDCOM_LINES.join(eol));
    expect(tree.individuals.map(i => i.name)).toEqual(['John Henry Carter', 'Mary Ellis', 'Sam Carter']);
    expect(tree.relationships).toHaveLength(3);
  });

  it('keeps multi-word names, dates and places', () => {
    const [john, mary] = parseGEDCOMText(GEDCOM_LINES.join('\n')).individuals;
    expect(john).toMatchObject({
      surnames: ['Carter'],
      birthDate: '4 Mar 1820',
      deathDate: '1 Jan 1890',
      locations: ['Springfield, Greene, Missouri, USA']
    });
    // The first NAME is the primary one
    expect(mary.surnames).toEqual(['Ellis']);
  });
});

describe('family tree cross-verification', () => {
  const settings: TriangulationSettings = {
    minimumSize: 7,
    minimumMatches: 3,
    minimumOverlapCM: 7,
    boundaryToleranceBp: 0,
    enableRelationshipPrediction: false,
    enableCrossVerification: true,
    separateByLineage: true,
    maxResultsPerPage: 25
  };
  const segment = (matchName: string, startPosition: number): DNAMatch => ({
    matchName, chromosome: 7, startPosition, endPosition: 1000, sizeCM: 15
  });
  const matches = [segment('Ann Carter', 100), segment('Bill Carter', 150), segment('Cara Li', 200), segment('Dan Williams', 250)];
  const tree = parseGEDCOMText(GEDCOM_LINES.join('\n'));

  it('never removes groups when a tree is loaded', () => {
    const withoutTree = buildTriangulationGroups(matches, settings);
    const withTree = buildTriangulationGroups(matches, settings, {}, () => {}, tree);
    expect(withTree).toHaveLength(withoutTree.length);
    expect(withTree[0].matches).toHaveLength(4);
  });

  it('reports surname lines shared by two or more matches', () => {
    const [group] = buildTriangulationGroups(matches, settings, {}, () => {}, tree);
    expect(group.commonAncestors).toEqual(['Carter line (2 of 4 matches)']);
    expect(group.treeMatches?.map(t => t.matchName)).toEqual(['Ann Carter', 'Bill Carter']);
    // Mary's primary name is Ellis, and "Li" must not match "Williams"
    expect(group.treeMatches?.[0].treeIndividuals).toEqual(['John Henry Carter', 'Sam Carter']);
  });
});
