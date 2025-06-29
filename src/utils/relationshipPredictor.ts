import { RelationshipPrediction } from '../types/triangulation';

// Shared cM Project data for relationship predictions
// Based on https://dnapainter.com/tools/sharedcmv4
const RELATIONSHIP_DATA = {
  'Parent/Child': { min: 3400, max: 3720, probability: 0.99 },
  'Full Sibling': { min: 2200, max: 3400, probability: 0.95 },
  'Half Sibling': { min: 1300, max: 2300, probability: 0.85 },
  'Grandparent/Grandchild': { min: 1200, max: 2300, probability: 0.90 },
  'Aunt/Uncle/Niece/Nephew': { min: 1200, max: 2300, probability: 0.80 },
  '1st Cousin': { min: 550, max: 1300, probability: 0.75 },
  '1st Cousin Once Removed': { min: 400, max: 1000, probability: 0.70 },
  '2nd Cousin': { min: 200, max: 600, probability: 0.65 },
  '2nd Cousin Once Removed': { min: 150, max: 500, probability: 0.60 },
  '3rd Cousin': { min: 75, max: 200, probability: 0.55 },
  '3rd Cousin Once Removed': { min: 50, max: 150, probability: 0.50 },
  '4th Cousin': { min: 20, max: 100, probability: 0.45 },
  '5th Cousin': { min: 10, max: 50, probability: 0.40 },
  '6th Cousin': { min: 5, max: 25, probability: 0.35 },
  '7th Cousin': { min: 0, max: 15, probability: 0.30 },
  '8th Cousin': { min: 0, max: 10, probability: 0.25 },
  '9th Cousin': { min: 0, max: 5, probability: 0.20 },
  '10th Cousin': { min: 0, max: 3, probability: 0.15 }
};

export const predictRelationship = (totalCM: number): RelationshipPrediction => {
  const relationships = Object.entries(RELATIONSHIP_DATA);
  
  // Find the best matching relationship
  let bestMatch = relationships[0];
  let bestScore = 0;
  
  for (const [relationship, data] of relationships) {
    if (totalCM >= data.min && totalCM <= data.max) {
      const score = data.probability;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = [relationship, data];
      }
    }
  }
  
  const [relationship, data] = bestMatch;
  
  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  if (data.probability >= 0.8) {
    confidence = 'high';
  } else if (data.probability >= 0.6) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Create range string
  const range = `${data.min}-${data.max} cM`;
  
  return {
    relationship,
    probability: data.probability,
    range,
    confidence
  };
};

export const calculateConfidenceScore = (
  averageSize: number,
  overlapPercentage: number,
  matchCount: number,
  totalCM: number
): number => {
  // Normalize each factor to 0-1 scale
  const sizeScore = Math.min(averageSize / 20, 1); // 20+ cM gets full score
  const overlapScore = overlapPercentage / 100;
  const matchScore = Math.min(matchCount / 10, 1); // 10+ matches gets full score
  const totalScore = Math.min(totalCM / 1000, 1); // 1000+ cM gets full score
  
  // Weighted average
  const confidenceScore = (
    sizeScore * 0.3 +
    overlapScore * 0.2 +
    matchScore * 0.3 +
    totalScore * 0.2
  );
  
  return Math.round(confidenceScore * 100);
};

export const getRelationshipDescription = (relationship: string): string => {
  const descriptions: Record<string, string> = {
    'Parent/Child': 'Direct parent-child relationship',
    'Full Sibling': 'Full siblings sharing both parents',
    'Half Sibling': 'Half siblings sharing one parent',
    'Grandparent/Grandchild': 'Grandparent-grandchild relationship',
    'Aunt/Uncle/Niece/Nephew': 'Aunt/uncle to niece/nephew',
    '1st Cousin': 'First cousins',
    '1st Cousin Once Removed': 'First cousin once removed',
    '2nd Cousin': 'Second cousins',
    '2nd Cousin Once Removed': 'Second cousin once removed',
    '3rd Cousin': 'Third cousins',
    '3rd Cousin Once Removed': 'Third cousin once removed',
    '4th Cousin': 'Fourth cousins',
    '5th Cousin': 'Fifth cousins',
    '6th Cousin': 'Sixth cousins',
    '7th Cousin': 'Seventh cousins',
    '8th Cousin': 'Eighth cousins',
    '9th Cousin': 'Ninth cousins',
    '10th Cousin': 'Tenth cousins'
  };
  
  return descriptions[relationship] || 'Distant relationship';
}; 