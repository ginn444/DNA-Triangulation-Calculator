import { DNAMatch, TriangulationGroup, CSVRow, TriangulationSettings, GenealogicalTree, TreeMatchInfo } from '../types/triangulation';
import { parseCSV } from './csvParser';
import { predictRelationship, calculateConfidenceScore } from './relationshipPredictor';
import { extractSurnames, findCommonAncestors } from './gedcomParser';

const DEFAULT_SETTINGS: TriangulationSettings = {
  minimumSize: 7, // 7 cM minimum
  minimumMatches: 3, // At least 3 people for triangulation
  overlapThreshold: 0.5, // 50% overlap required
  enableRelationshipPrediction: true,
  enableConfidenceScoring: true,
  enableCrossVerification: false,
  maxResultsPerPage: 25
};

export const processTriangulation = async (
  files: File[], 
  settings: TriangulationSettings = DEFAULT_SETTINGS,
  onProgress: (message: string) => void,
  genealogicalTree: GenealogicalTree | null = null
): Promise<TriangulationGroup[]> => {
  onProgress('Parsing uploaded CSV files...');
  
  const allMatches: DNAMatch[] = [];
  
  // Parse all CSV files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
    
    try {
      const csvData = await parseCSV(file);
      console.log(`CSV data from ${file.name}:`, csvData.slice(0, 3)); // Log first 3 rows for debugging
      
      const matches = parseMatchesFromCSV(csvData, file.name, settings);
      allMatches.push(...matches);
      onProgress(`Found ${matches.length} DNA segments in ${file.name}`);
    } catch (error) {
      throw new Error(`Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  if (allMatches.length === 0) {
    throw new Error('No valid DNA segment data found in uploaded files. Please check that your CSV files contain the required columns: Chromosome, Start Location, End Location, and either Overlap cM or Shared DNA.');
  }
  
  onProgress(`Processing ${allMatches.length} total DNA segments...`);
  
  // Find triangulations
  const triangulationGroups = findTriangulations(allMatches, settings, onProgress, genealogicalTree);
  
  // Apply enhanced analysis if enabled
  if (settings.enableRelationshipPrediction || settings.enableConfidenceScoring) {
    onProgress('Applying enhanced analysis...');
    triangulationGroups.forEach(group => {
      // Calculate confidence score
      if (settings.enableConfidenceScoring) {
        const totalCM = group.matches.reduce((sum, match) => sum + match.sizeCM, 0);
        const averageOverlap = calculateAverageOverlap(group.matches);
        group.confidenceScore = calculateConfidenceScore(
          group.averageSize,
          averageOverlap,
          group.matches.length,
          totalCM
        );
      }
      
      // Predict relationship
      if (settings.enableRelationshipPrediction) {
        const totalCM = group.matches.reduce((sum, match) => sum + match.sizeCM, 0);
        group.relationshipPrediction = predictRelationship(totalCM);
      }
    });
  }
  
  onProgress(`Analysis complete: Found ${triangulationGroups.length} triangulation groups`);
  
  return triangulationGroups;
};

const parseMatchesFromCSV = (csvData: CSVRow[], fileName: string, settings: TriangulationSettings): DNAMatch[] => {
  const matches: DNAMatch[] = [];
  
  // The CSV parser now standardizes field names, so we can use the standard field names
  const requiredFields = ['chromosome', 'startPosition', 'endPosition', 'sizeCM'];
  const sampleRow = csvData[0];
  
  if (!sampleRow) {
    console.warn(`No data found in ${fileName}`);
    return matches;
  }
  
  const availableFields = Object.keys(sampleRow);
  console.log(`Available fields in ${fileName}:`, availableFields);
  
  // Check if we have the required fields (either standardized or original)
  const hasRequiredFields = requiredFields.every(field => 
    availableFields.includes(field) || 
    availableFields.some(available => available.toLowerCase().includes(field.toLowerCase()))
  );
  
  if (!hasRequiredFields) {
    console.warn(`Missing required fields in ${fileName}. Available:`, availableFields);
    console.warn('Required fields:', requiredFields);
    return matches;
  }
  
  for (const row of csvData) {
    try {
      // Enhanced match name extraction - try multiple fields and combine if needed
      let matchName = '';
      
      // Try standardized field first
      if (row['matchName']) {
        matchName = row['matchName'];
      } else {
        // Try to construct from available name fields
        const firstName = row['First Name'] || row['firstName'] || '';
        const lastName = row['Last Name'] || row['lastName'] || '';
        const fullName = row['Full Name'] || row['Name'] || row['Match Names'] || '';
        
        if (fullName) {
          matchName = fullName;
        } else if (firstName || lastName) {
          matchName = `${firstName} ${lastName}`.trim();
        }
      }
      
      // If it's "Match Names" field, it might contain multiple names - take the first one
      if (matchName && (matchName.includes(',') || matchName.includes(';') || matchName.includes('|'))) {
        const nameParts = matchName.split(/[,;|]/);
        matchName = nameParts[0]?.trim();
      }
      
      // Get chromosome - try standardized field first
      const chromosomeField = row['chromosome'] || row['Chromosome'];
      const chromosome = parseInt(chromosomeField?.trim());
      
      // Get start position - try standardized field first
      const startField = row['startPosition'] || row['Start Location'] || row['Start Position'];
      const startPosition = parseInt(startField?.replace(/,/g, '').trim());
      
      // Get end position - try standardized field first
      const endField = row['endPosition'] || row['End Location'] || row['End Position'];
      const endPosition = parseInt(endField?.replace(/,/g, '').trim());
      
      // Get size in cM - try standardized field first
      const sizeField = row['sizeCM'] || row['Overlap cM'] || row['Shared DNA'] || row['Longest Block'];
      const sizeCM = parseFloat(sizeField?.trim());
      
      // Get matching SNPs if available
      const snpsField = row['matchingSNPs'] || row['Markers Tested'] || row['SNPs'];
      const matchingSNPs = snpsField ? parseInt(snpsField.replace(/,/g, '').trim()) : undefined;
      
      // Extract haplogroups
      const yHaplogroup = row['yHaplogroup'] || row['Y-DNA Haplogroup'] || row['Y Haplogroup'] || row['Paternal Haplogroup'];
      const mtHaplogroup = row['mtHaplogroup'] || row['mtDNA Haplogroup'] || row['mt Haplogroup'] || row['Maternal Haplogroup'];
      
      // Extract additional genealogical data
      const ancestralSurnames = row['ancestralSurnames'] || row['Ancestral Surnames'] || row['Surnames'];
      const locations = row['locations'] || row['Paternal Country of Origin'] || row['Paternal Origin'];
      const notes = row['notes'] || row['Notes'] || row['Comments'];
      
      // Validate data
      if (matchName && 
          !isNaN(chromosome) && chromosome >= 1 && chromosome <= 23 &&
          !isNaN(startPosition) && startPosition > 0 &&
          !isNaN(endPosition) && endPosition > startPosition &&
          !isNaN(sizeCM) && sizeCM >= settings.minimumSize) {
        
        const match: DNAMatch = {
          matchName,
          chromosome,
          startPosition,
          endPosition,
          sizeCM,
          matchingSNPs: isNaN(matchingSNPs!) ? undefined : matchingSNPs
        };
        
        // Add optional fields if available
        if (yHaplogroup) match.yHaplogroup = yHaplogroup.trim();
        if (mtHaplogroup) match.mtHaplogroup = mtHaplogroup.trim();
        if (ancestralSurnames) match.ancestralSurnames = ancestralSurnames.split(/[,;|]/).map(s => s.trim()).filter(s => s);
        if (locations) match.locations = locations.split(/[,;|]/).map(l => l.trim()).filter(l => l);
        if (notes) match.notes = notes.trim();
        
        matches.push(match);
      }
    } catch (error) {
      // Skip invalid rows
      console.warn('Skipping invalid row:', row, 'Error:', error);
      continue;
    }
  }
  
  console.log(`Parsed ${matches.length} valid matches from ${fileName}`);
  return matches;
};

const findTriangulations = (
  matches: DNAMatch[], 
  settings: TriangulationSettings,
  onProgress: (message: string) => void,
  genealogicalTree: GenealogicalTree | null = null
): TriangulationGroup[] => {
  onProgress('Grouping segments by chromosome...');
  
  // Group matches by chromosome
  const matchesByChromosome = new Map<number, DNAMatch[]>();
  
  for (const match of matches) {
    if (!matchesByChromosome.has(match.chromosome)) {
      matchesByChromosome.set(match.chromosome, []);
    }
    matchesByChromosome.get(match.chromosome)!.push(match);
  }
  
  const triangulationGroups: TriangulationGroup[] = [];
  
  // Process each chromosome
  for (const [chromosome, chromosomeMatches] of matchesByChromosome) {
    onProgress(`Analyzing chromosome ${chromosome} (${chromosomeMatches.length} segments)...`);
    
    const groups = findTriangulationsOnChromosome(chromosomeMatches, settings, genealogicalTree);
    triangulationGroups.push(...groups);
  }
  
  // Sort groups by chromosome and then by start position
  triangulationGroups.sort((a, b) => {
    if (a.chromosome !== b.chromosome) {
      return a.chromosome - b.chromosome;
    }
    return a.startPosition - b.startPosition;
  });
  
  return triangulationGroups;
};

const findTriangulationsOnChromosome = (
  matches: DNAMatch[], 
  settings: TriangulationSettings,
  genealogicalTree: GenealogicalTree | null = null
): TriangulationGroup[] => {
  const triangulationGroups: TriangulationGroup[] = [];
  const processedMatches = new Set<number>();
  
  // Sort matches by start position
  matches.sort((a, b) => a.startPosition - b.startPosition);
  
  for (let i = 0; i < matches.length; i++) {
    if (processedMatches.has(i)) continue;
    
    const baseMatch = matches[i];
    const overlappingMatches = [baseMatch];
    const overlappingIndices = [i];
    
    // Find all matches that overlap with the base match
    for (let j = i + 1; j < matches.length; j++) {
      if (processedMatches.has(j)) continue;
      
      const testMatch = matches[j];
      
      // If the test match starts after the base match ends, no more overlaps possible
      if (testMatch.startPosition > baseMatch.endPosition) {
        break;
      }
      
      // Check if there's significant overlap
      const overlapStart = Math.max(baseMatch.startPosition, testMatch.startPosition);
      const overlapEnd = Math.min(baseMatch.endPosition, testMatch.endPosition);
      
      if (overlapEnd > overlapStart) {
        const overlapSize = overlapEnd - overlapStart;
        const baseSize = baseMatch.endPosition - baseMatch.startPosition;
        const testSize = testMatch.endPosition - testMatch.startPosition;
        const minSize = Math.min(baseSize, testSize);
        
        // Check if overlap is significant enough
        if (overlapSize / minSize >= settings.overlapThreshold) {
          overlappingMatches.push(testMatch);
          overlappingIndices.push(j);
        }
      }
    }
    
    // If we have enough matches for triangulation, create a group
    if (overlappingMatches.length >= settings.minimumMatches) {
      // Calculate the overlapping region
      const startPosition = Math.max(...overlappingMatches.map(m => m.startPosition));
      const endPosition = Math.min(...overlappingMatches.map(m => m.endPosition));
      
      if (endPosition > startPosition) {
        const totalSize = overlappingMatches.reduce((sum, match) => sum + match.sizeCM, 0);
        const averageSize = totalSize / overlappingMatches.length;
        
        // Create the triangulation group
        const group: TriangulationGroup = {
          chromosome: baseMatch.chromosome,
          startPosition,
          endPosition,
          matches: overlappingMatches,
          averageSize,
          totalSize,
          confidenceScore: 0 // Will be calculated later
        };
        
        // Integrate genealogical tree data if available
        if (genealogicalTree && settings.enableCrossVerification) {
          integrateGenealogicalData(group, genealogicalTree);
        }
        
        triangulationGroups.push(group);
        
        // Mark these matches as processed
        overlappingIndices.forEach(index => processedMatches.add(index));
      }
    }
  }
  
  return triangulationGroups;
};

const integrateGenealogicalData = (group: TriangulationGroup, genealogicalTree: GenealogicalTree): void => {
  const allSurnames = new Set<string>();
  const treeMatches: TreeMatchInfo[] = [];
  
  // Process each match in the group
  for (const match of group.matches) {
    // Extract surnames from match name
    const matchSurnames = extractSurnamesFromName(match.matchName);
    matchSurnames.forEach(surname => allSurnames.add(surname.toLowerCase()));
    
    // Add ancestral surnames if available
    if (match.ancestralSurnames) {
      match.ancestralSurnames.forEach(surname => allSurnames.add(surname.toLowerCase()));
    }
    
    // Find matching individuals in the genealogical tree
    const matchingIndividuals = genealogicalTree.individuals.filter(individual => {
      const individualName = individual.name.toLowerCase();
      const matchNameLower = match.matchName.toLowerCase();
      
      // Check if names match or contain each other
      return individualName.includes(matchNameLower) || 
             matchNameLower.includes(individualName) ||
             individual.surnames.some(surname => 
               matchSurnames.some(matchSurname => 
                 surname.toLowerCase().includes(matchSurname.toLowerCase()) ||
                 matchSurname.toLowerCase().includes(surname.toLowerCase())
               )
             );
    });
    
    if (matchingIndividuals.length > 0) {
      const commonSurnames = new Set<string>();
      const suggestedAncestors = new Set<string>();
      
      matchingIndividuals.forEach(individual => {
        individual.surnames.forEach(surname => commonSurnames.add(surname));
        suggestedAncestors.add(individual.name);
      });
      
      treeMatches.push({
        matchName: match.matchName,
        treeIndividuals: matchingIndividuals.map(i => i.name),
        commonSurnames: Array.from(commonSurnames),
        suggestedAncestors: Array.from(suggestedAncestors)
      });
    }
  }
  
  // Set group-level data
  group.surnames = Array.from(allSurnames);
  group.treeMatches = treeMatches;
  
  // Find common ancestors using the genealogical tree
  if (allSurnames.size > 0) {
    const commonAncestors = findCommonAncestors(Array.from(allSurnames), genealogicalTree);
    group.commonAncestors = commonAncestors.map(ancestor => ancestor.name);
  }
};

const extractSurnamesFromName = (name: string): string[] => {
  // Simple surname extraction - assumes last word is surname
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    return [parts[parts.length - 1]];
  }
  return [];
};

const calculateAverageOverlap = (matches: DNAMatch[]): number => {
  if (matches.length < 2) return 100;
  
  let totalOverlap = 0;
  let overlapCount = 0;
  
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const match1 = matches[i];
      const match2 = matches[j];
      
      const overlapStart = Math.max(match1.startPosition, match2.startPosition);
      const overlapEnd = Math.min(match1.endPosition, match2.endPosition);
      
      if (overlapEnd > overlapStart) {
        const overlapSize = overlapEnd - overlapStart;
        const match1Size = match1.endPosition - match1.startPosition;
        const match2Size = match2.endPosition - match2.startPosition;
        const minSize = Math.min(match1Size, match2Size);
        
        const overlapPercentage = (overlapSize / minSize) * 100;
        totalOverlap += overlapPercentage;
        overlapCount++;
      }
    }
  }
  
  return overlapCount > 0 ? totalOverlap / overlapCount : 100;
};