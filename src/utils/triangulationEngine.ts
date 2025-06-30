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

// Interface for raw DNA match data before deduplication
interface RawDNAMatch extends DNAMatch {
  sourceFile: string;
}

// Interface for merged match profile during deduplication
interface MatchProfile {
  canonicalName: string;
  displayName: string;
  nameVariations: Set<string>;
  segments: RawDNAMatch[];
  // Merged metadata
  yHaplogroup?: string;
  mtHaplogroup?: string;
  ancestralSurnames: Set<string>;
  locations: Set<string>;
  notes: Set<string>;
  sourceFiles: Set<string>;
}

/**
 * Deduplicates and cleans an array of names by removing duplicates,
 * filtering out single-letter entries and empty strings, and sorting alphabetically.
 */
const deduplicateNames = (rawNames: string[]): string[] => {
  // Join all names into a single string, then split by commas and spaces
  const combinedNames = rawNames.join(', ');
  
  return Array.from(
    new Set(
      combinedNames
        .split(/[,\s]+/)                      // Split on commas and spaces
        .map(name => name.trim().toLowerCase()) // Normalize (trim + lowercase)
        .filter(name => name.length > 1)         // Filter out junk/empty or 1-letter noise
    )
  ).sort(); // Alphabetize the results
};

export const processTriangulation = async (
  files: File[], 
  settings: TriangulationSettings = DEFAULT_SETTINGS,
  onProgress: (message: string) => void,
  genealogicalTree: GenealogicalTree | null = null
): Promise<TriangulationGroup[]> => {
  onProgress('Parsing uploaded CSV files...');
  
  const allRawMatches: RawDNAMatch[] = [];
  const nameIssues: string[] = [];
  
  // Parse all CSV files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
    
    try {
      const csvData = await parseCSV(file);
      console.log(`CSV data from ${file.name}:`, csvData.slice(0, 3)); // Log first 3 rows for debugging
      
      const { matches, issues } = parseMatchesFromCSV(csvData, file.name, settings);
      // Mark each match with its source file
      const markedMatches = matches.map(match => ({ ...match, sourceFile: file.name }));
      allRawMatches.push(...markedMatches);
      nameIssues.push(...issues);
      onProgress(`Found ${matches.length} DNA segments in ${file.name}`);
    } catch (error) {
      throw new Error(`Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  if (allRawMatches.length === 0) {
    throw new Error('No valid DNA segment data found in uploaded files. Please check that your CSV files contain the required columns: Chromosome, Start Location, End Location, and either Overlap cM or Shared DNA.');
  }
  
  // Check for name issues and warn user
  if (nameIssues.length > 0) {
    console.warn('Name detection issues found:', nameIssues);
    onProgress(`Warning: ${nameIssues.length} matches have unclear names - check your CSV headers`);
  }
  
  onProgress(`Deduplicating and merging ${allRawMatches.length} DNA segments...`);
  
  // Deduplicate and merge matches
  const deduplicatedMatches = deduplicateAndMergeMatches(allRawMatches, onProgress);
  
  // Populate tree information for each DNA match if genealogical tree is available
  if (genealogicalTree && settings.enableCrossVerification) {
    onProgress('Enriching DNA matches with genealogical tree data...');
    for (const match of deduplicatedMatches) {
      populateDNAMatchTreeInfo(match, genealogicalTree);
    }
  }
  
  onProgress(`Processing ${deduplicatedMatches.length} deduplicated DNA segments...`);
  
  // Find triangulations
  const triangulationGroups = findTriangulations(deduplicatedMatches, settings, onProgress, genealogicalTree);
  
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

const populateDNAMatchTreeInfo = (match: DNAMatch, genealogicalTree: GenealogicalTree): void => {
  const treeMatches: TreeMatchInfo[] = [];
  
  // Extract surnames from match name
  const matchSurnames = extractSurnamesFromName(match.matchName);
  const allSurnames = new Set<string>();
  
  // Add surnames from match name
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
      treeIndividuals: deduplicateNames(matchingIndividuals.map(i => i.name)),
      commonSurnames: Array.from(commonSurnames),
      suggestedAncestors: Array.from(suggestedAncestors)
    });
  }
  
  // Set the tree match info on the DNA match
  match.treeMatchInfo = treeMatches.length > 0 ? treeMatches : undefined;
};

const deduplicateAndMergeMatches = (rawMatches: RawDNAMatch[], onProgress: (message: string) => void): DNAMatch[] => {
  onProgress('Building canonicalization map...');
  
  // Step 1: Build canonicalization map
  const profileMap = new Map<string, MatchProfile>();
  
  for (const match of rawMatches) {
    const canonicalName = canonicalizeName(match.matchName);
    
    if (!profileMap.has(canonicalName)) {
      // Create new profile
      profileMap.set(canonicalName, {
        canonicalName,
        displayName: match.matchName, // Use first encountered name as display name
        nameVariations: new Set([match.matchName]),
        segments: [],
        yHaplogroup: match.yHaplogroup,
        mtHaplogroup: match.mtHaplogroup,
        ancestralSurnames: new Set(match.ancestralSurnames || []),
        locations: new Set(match.locations || []),
        notes: new Set(match.notes ? [match.notes] : []),
        sourceFiles: new Set([match.sourceFile])
      });
    }
    
    const profile = profileMap.get(canonicalName)!;
    
    // Add this segment to the profile
    profile.segments.push(match);
    profile.nameVariations.add(match.matchName);
    profile.sourceFiles.add(match.sourceFile);
    
    // Merge metadata (prioritize first non-empty values for single-value fields)
    if (!profile.yHaplogroup && match.yHaplogroup) {
      profile.yHaplogroup = match.yHaplogroup;
    }
    if (!profile.mtHaplogroup && match.mtHaplogroup) {
      profile.mtHaplogroup = match.mtHaplogroup;
    }
    
    // Merge multi-value fields
    if (match.ancestralSurnames) {
      match.ancestralSurnames.forEach(surname => profile.ancestralSurnames.add(surname));
    }
    if (match.locations) {
      match.locations.forEach(location => profile.locations.add(location));
    }
    if (match.notes) {
      profile.notes.add(match.notes);
    }
  }
  
  onProgress(`Merged ${rawMatches.length} segments into ${profileMap.size} unique individuals`);
  
  // Step 2: Create enriched DNAMatch objects
  const enrichedMatches: DNAMatch[] = [];
  
  for (const profile of profileMap.values()) {
    // Convert sets back to arrays for the final data structure
    const mergedAncestralSurnames = Array.from(profile.ancestralSurnames).filter(s => s.trim());
    const mergedLocations = Array.from(profile.locations).filter(l => l.trim());
    const mergedNotes = Array.from(profile.notes).filter(n => n.trim()).join('; ');
    const sourceFilesList = Array.from(profile.sourceFiles);
    
    // Update each segment with merged metadata and canonical display name
    for (const segment of profile.segments) {
      const enrichedMatch: DNAMatch = {
        ...segment,
        matchName: profile.displayName, // Use consistent display name
        sourceFile: sourceFilesList.length > 1 ? sourceFilesList.join(', ') : segment.sourceFile,
        yHaplogroup: profile.yHaplogroup,
        mtHaplogroup: profile.mtHaplogroup,
        ancestralSurnames: mergedAncestralSurnames.length > 0 ? mergedAncestralSurnames : undefined,
        locations: mergedLocations.length > 0 ? mergedLocations : undefined,
        notes: mergedNotes || undefined
      };
      
      enrichedMatches.push(enrichedMatch);
    }
  }
  
  onProgress(`Created ${enrichedMatches.length} enriched DNA segments`);
  
  return enrichedMatches;
};

const canonicalizeName = (name: string): string => {
  if (!name) return '';
  
  // Basic canonicalization: lowercase, trim, remove extra spaces
  let canonical = name.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Handle common name format variations
  // "Smith, John" -> "john smith"
  if (canonical.includes(',')) {
    const parts = canonical.split(',').map(p => p.trim());
    if (parts.length === 2) {
      canonical = `${parts[1]} ${parts[0]}`.trim();
    }
  }
  
  // Remove common prefixes/suffixes that might cause duplicates
  canonical = canonical
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '') // Remove Jr, Sr, II, III, IV
    .replace(/\b(mr|mrs|ms|dr|prof)\b\.?/g, '') // Remove titles
    .replace(/\s+/g, ' ') // Clean up extra spaces
    .trim();
  
  // Handle initials: "J. Smith" and "John Smith" should match if we have additional context
  // For now, we'll use a simple approach - this could be enhanced with fuzzy matching
  
  return canonical;
};

const parseMatchesFromCSV = (csvData: CSVRow[], fileName: string, settings: TriangulationSettings): { matches: DNAMatch[], issues: string[] } => {
  const matches: DNAMatch[] = [];
  const issues: string[] = [];
  
  // The CSV parser now standardizes field names, so we can use the standard field names
  const requiredFields = ['chromosome', 'startPosition', 'endPosition', 'sizeCM'];
  const sampleRow = csvData[0];
  
  if (!sampleRow) {
    console.warn(`No data found in ${fileName}`);
    return { matches, issues };
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
    return { matches, issues };
  }
  
  for (let rowIndex = 0; rowIndex < csvData.length; rowIndex++) {
    const row = csvData[rowIndex];
    
    try {
      // Enhanced match name extraction - now relies on the improved CSV parser
      let matchName = row['matchName'] || '';
      
      // If no matchName was mapped by the parser, try fallback logic
      if (!matchName) {
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
      
      // Check if the name looks suspicious (purely numeric or very short)
      if (matchName) {
        if (/^\d+$/.test(matchName)) {
          // Purely numeric - create a more descriptive name
          const originalName = matchName;
          matchName = `Match ${originalName} (from ${fileName})`;
          issues.push(`Row ${rowIndex + 1}: Numeric match name "${originalName}" converted to "${matchName}"`);
        } else if (matchName.length < 2) {
          // Very short name - might be an issue
          const originalName = matchName;
          matchName = `Match "${originalName}" (from ${fileName})`;
          issues.push(`Row ${rowIndex + 1}: Short match name "${originalName}" - please verify`);
        }
      } else {
        // No name found - create a generic identifier
        matchName = `Match ${rowIndex + 1} (from ${fileName})`;
        issues.push(`Row ${rowIndex + 1}: No match name found - using generic identifier`);
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
  if (issues.length > 0) {
    console.log(`Found ${issues.length} name issues in ${fileName}`);
  }
  
  return { matches, issues };
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
  
  const initialTriangulationGroups: TriangulationGroup[] = [];
  
  // Process each chromosome to find initial overlapping groups
  for (const [chromosome, chromosomeMatches] of matchesByChromosome) {
    onProgress(`Analyzing chromosome ${chromosome} (${chromosomeMatches.length} segments)...`);
    
    const groups = findTriangulationsOnChromosome(chromosomeMatches, settings);
    initialTriangulationGroups.push(...groups);
  }
  
  // Split groups by single common ancestor if genealogical tree is available
  let finalGroups = initialTriangulationGroups;
  if (genealogicalTree && settings.enableCrossVerification) {
    onProgress('Splitting groups by common ancestors...');
    finalGroups = splitGroupsBySingleCommonAncestor(initialTriangulationGroups, settings);
  }
  
  // Sort groups by common ancestor first, then by chromosome and position
  finalGroups.sort((a, b) => {
    // First sort by common ancestor
    const aAncestor = a.commonAncestors && a.commonAncestors.length > 0 ? a.commonAncestors[0] : '';
    const bAncestor = b.commonAncestors && b.commonAncestors.length > 0 ? b.commonAncestors[0] : '';
    
    if (aAncestor !== bAncestor) {
      return aAncestor.localeCompare(bAncestor);
    }
    
    // Then by chromosome
    if (a.chromosome !== b.chromosome) {
      return a.chromosome - b.chromosome;
    }
    
    // Finally by start position
    return a.startPosition - b.startPosition;
  });
  
  return finalGroups;
};

const splitGroupsBySingleCommonAncestor = (
  initialGroups: TriangulationGroup[],
  settings: TriangulationSettings
): TriangulationGroup[] => {
  const finalGroups: TriangulationGroup[] = [];
  
  for (const initialGroup of initialGroups) {
    // Collect all unique suggested ancestors from the matches in this group
    const ancestorToMatches = new Map<string, DNAMatch[]>();
    
    for (const match of initialGroup.matches) {
      if (match.treeMatchInfo) {
        for (const treeMatch of match.treeMatchInfo) {
          for (const ancestor of treeMatch.suggestedAncestors) {
            if (!ancestorToMatches.has(ancestor)) {
              ancestorToMatches.set(ancestor, []);
            }
            ancestorToMatches.get(ancestor)!.push(match);
          }
        }
      }
    }
    
    // If no ancestors found, keep the original group
    if (ancestorToMatches.size === 0) {
      finalGroups.push(initialGroup);
      continue;
    }
    
    // Create new groups for each ancestor
    for (const [ancestor, matchesForAncestor] of ancestorToMatches) {
      // Remove duplicates (a match might be associated with the same ancestor multiple times)
      const uniqueMatches = Array.from(new Set(matchesForAncestor));
      
      // Only create group if it meets minimum match requirements
      if (uniqueMatches.length >= settings.minimumMatches) {
        // Calculate the overlapping region for this subset
        const startPosition = Math.max(...uniqueMatches.map(m => m.startPosition));
        const endPosition = Math.min(...uniqueMatches.map(m => m.endPosition));
        
        if (endPosition > startPosition) {
          const totalSize = uniqueMatches.reduce((sum, match) => sum + match.sizeCM, 0);
          const averageSize = totalSize / uniqueMatches.length;
          
          // Create tree matches for this specific ancestor
          const treeMatches: TreeMatchInfo[] = [];
          for (const match of uniqueMatches) {
            if (match.treeMatchInfo) {
              const relevantTreeMatches = match.treeMatchInfo.filter(tm => 
                tm.suggestedAncestors.includes(ancestor)
              );
              treeMatches.push(...relevantTreeMatches);
            }
          }
          
          const newGroup: TriangulationGroup = {
            chromosome: initialGroup.chromosome,
            startPosition,
            endPosition,
            matches: uniqueMatches,
            averageSize,
            totalSize,
            confidenceScore: 0, // Will be calculated later
            commonAncestors: [ancestor], // Single ancestor for this group
            treeMatches: treeMatches.length > 0 ? treeMatches : undefined
          };
          
          finalGroups.push(newGroup);
        }
      }
    }
  }
  
  return finalGroups;
};

const findTriangulationsOnChromosome = (
  matches: DNAMatch[], 
  settings: TriangulationSettings
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
        
        triangulationGroups.push(group);
        
        // Mark these matches as processed
        overlappingIndices.forEach(index => processedMatches.add(index));
      }
    }
  }
  
  return triangulationGroups;
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