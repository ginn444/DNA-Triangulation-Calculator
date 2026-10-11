import { GenerationEstimate } from '../utils/segmentAge';

export interface DNAMatch {
  matchName: string;
  chromosome: number;
  startPosition: number;
  endPosition: number;
  sizeCM: number;
  matchingSNPs?: number;
  sourceFile?: string; // New field to track which file this match came from
  // Enhanced fields for genealogical analysis
  yHaplogroup?: string;
  mtHaplogroup?: string;
  relationshipPrediction?: RelationshipPrediction;
  confidenceScore?: number;
  // Additional genealogical data
  ancestralSurnames?: string[];
  locations?: string[];
  notes?: string;
  // Tree match information for this specific DNA match
  treeMatchInfo?: TreeMatchInfo[];
  // Lineage path tagged by the user, e.g. "PPM" = father's father's mother (see utils/lineage.ts)
  lineage?: string;
  // Total cM this person shares with you across every uploaded segment
  totalSharedCM?: number;
}

export interface RelationshipPrediction {
  relationship: string;
  probability: number;
  range: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * How strong the overlap evidence for a group is. Overlap with you alone does not prove the
 * matches share the segment with each other (it may be on your other parental copy).
 * - strong:   everyone shares a stretch of 15 cM or more with you (segments this size are almost always IBD)
 * - moderate: the shared stretch is at least the minimum (default 7 cM) but under 15 cM
 * - pile-up:  the stretch sits where unusually many of your matches share DNA, which usually
 *             reflects very old shared ancestry rather than a recent common ancestor
 */
export type EvidenceLevel = 'strong' | 'moderate' | 'pile-up';

export interface TriangulationGroup {
  id: number; // Stable identifier, independent of filtering, sorting and paging
  chromosome: number;
  startPosition: number;
  endPosition: number;
  matches: DNAMatch[];
  averageSize: number;
  totalSize: number;
  // Enhanced analysis fields
  // Rank derived from the evidence level (strong 90, moderate 60, pile-up 20), for sorting and filtering
  confidenceScore: number;
  evidence: EvidenceLevel;
  // Estimated cM of the stretch every member shares with you (conservative: smallest member estimate)
  sharedCM: number;
  // Distinct matches in the whole upload with a segment covering this stretch
  regionMatchCount: number;
  // Genetic clock: how many generations back the shared ancestor most likely lived
  generationEstimate?: GenerationEstimate;
  relationshipPrediction?: RelationshipPrediction;
  annotations?: GroupAnnotation;
  commonAncestors?: string[];
  surnames?: string[];
  // Genealogical tree integration
  treeMatches?: TreeMatchInfo[];
  // Most specific lineage shared by the tagged members, and whether members disagree
  lineage?: string;
  lineageConflict?: boolean;
}

export interface TreeMatchInfo {
  matchName: string;
  treeIndividuals: string[];
  commonSurnames: string[];
  suggestedAncestors: string[];
}

export interface GroupAnnotation {
  notes?: string;
  surnames?: string[];
  locations?: string[];
  researchStatus?: 'pending' | 'in-progress' | 'completed' | 'verified';
  tags?: string[];
  lastModified: Date;
}

export interface CSVRow {
  [key: string]: string;
}

export type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error';

export interface TriangulationSettings {
  minimumSize: number; // Minimum segment size in cM
  minimumMatches: number; // Minimum number of matches for triangulation
  minimumOverlapCM: number; // Minimum size of the stretch every member shares, in cM
  // Enhanced features
  enableRelationshipPrediction: boolean;
  enableCrossVerification: boolean;
  separateByLineage: boolean; // Never group matches tagged with conflicting lineages
  maxResultsPerPage: number;
}

export interface FilterOptions {
  chromosome?: number;
  minSize?: number;
  maxSize?: number;
  minMatches?: number;
  maxMatches?: number;
  confidenceThreshold?: number;
  cousinLevel?: string;
  generation?: number;
  searchTerm?: string;
  // A lineage path to show (that branch and deeper), or 'untagged' / 'conflict'
  lineage?: string;
  evidence?: EvidenceLevel | 'not-pile-up';
  sortBy: 'chromosome' | 'averageSize' | 'matches' | 'confidenceScore' | 'startPosition' | 'commonAncestors' | 'sharedCM';
  sortOrder: 'asc' | 'desc';
}

export interface PaginationState {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
}

export interface GenealogicalTree {
  individuals: TreeIndividual[];
  relationships: TreeRelationship[];
}

export interface TreeIndividual {
  id: string;
  name: string;
  surnames: string[];
  sex?: 'M' | 'F';
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  // Every place recorded for the person (birth, residence, death, ...)
  locations?: string[];
  // The GEDCOM file the person came from, when several trees are loaded
  sourceFile?: string;
}

export interface TreeRelationship {
  id: string;
  individual1: string;
  individual2: string;
  relationshipType: string;
  // For 'parent-child': whether individual1 is the father or the mother
  parentRole?: 'father' | 'mother';
}

export interface CrossVerificationResult {
  groupId: number;
  potentialMatches: TreeIndividual[];
  confidence: number;
  suggestedAncestors: string[];
}