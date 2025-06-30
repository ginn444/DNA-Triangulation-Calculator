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
}

export interface RelationshipPrediction {
  relationship: string;
  probability: number;
  range: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface TriangulationGroup {
  chromosome: number;
  startPosition: number;
  endPosition: number;
  matches: DNAMatch[];
  averageSize: number;
  totalSize: number;
  // Enhanced analysis fields
  confidenceScore: number;
  relationshipPrediction?: RelationshipPrediction;
  annotations?: GroupAnnotation;
  commonAncestors?: string[];
  surnames?: string[];
  // Genealogical tree integration
  treeMatches?: TreeMatchInfo[];
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
  overlapThreshold: number; // Minimum overlap percentage
  // Enhanced features
  enableRelationshipPrediction: boolean;
  enableConfidenceScoring: boolean;
  enableCrossVerification: boolean;
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
  sortBy: 'chromosome' | 'averageSize' | 'matches' | 'confidenceScore' | 'startPosition' | 'commonAncestors';
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
  birthDate?: string;
  deathDate?: string;
  locations?: string[];
}

export interface TreeRelationship {
  id: string;
  individual1: string;
  individual2: string;
  relationshipType: string;
}

export interface CrossVerificationResult {
  groupId: number;
  potentialMatches: TreeIndividual[];
  confidence: number;
  suggestedAncestors: string[];
}