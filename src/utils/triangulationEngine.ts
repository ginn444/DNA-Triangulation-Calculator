import { DNAMatch, TriangulationGroup, CSVRow, TriangulationSettings, GenealogicalTree, TreeMatchInfo } from '../types/triangulation';
import { parseCSV } from './csvParser';
import { predictRelationship, calculateConfidenceScore } from './relationshipPredictor';
import { lineagesCompatible, mergeLineages, normalizeLineage, summarizeLineage } from './lineage';

const DEFAULT_SETTINGS: TriangulationSettings = {
  minimumSize: 7, // 7 cM minimum
  minimumMatches: 3, // At least 3 people for triangulation
  overlapThreshold: 0.5, // 50% overlap required
  enableRelationshipPrediction: true,
  enableConfidenceScoring: true,
  enableCrossVerification: false,
  separateByLineage: true,
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
  lineage?: string;
  ancestralSurnames: Set<string>;
  locations: Set<string>;
  notes: Set<string>;
  sourceFiles: Set<string>;
}

export const processTriangulation = async (
  files: File[], 
  settings: TriangulationSettings = DEFAULT_SETTINGS,
  onProgress: (message: string) => void,
  genealogicalTree: GenealogicalTree | null = null
): Promise<TriangulationGroup[]> => {
  const matches = await loadMatches(files, settings, onProgress);
  return buildTriangulationGroups(matches, settings, {}, onProgress, genealogicalTree);
};

/**
 * Parses and deduplicates the DNA segments in the
 * uploaded files. The result can be regrouped with buildTriangulationGroups
 * without re-reading the files, e.g. after lineage tags change.
 */
export const loadMatches = async (
  files: File[], 
  settings: TriangulationSettings = DEFAULT_SETTINGS,
  onProgress: (message: string) => void
): Promise<DNAMatch[]> => {
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
      
      // Size filtering happens in buildTriangulationGroups so it can change without re-uploading
      const { matches, issues } = parseMatchesFromCSV(csvData, file.name, { ...settings, minimumSize: 0 });
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
  
  return deduplicatedMatches;
};

/**
 * Identifies a group across regrouping (e.g. after lineage tags change) by the
 * segment it was built from, so annotations and expanded state can follow it.
 */
export const groupKey = (group: TriangulationGroup): string => {
  const base = group.matches[0];
  return `${group.chromosome}:${canonicalizeName(base?.matchName ?? '')}:${base?.startPosition ?? group.startPosition}`;
};

/** Lineage tags keyed by canonical match name (see canonicalizeName); '' clears a CSV-provided lineage */
export type LineageTags = Record<string, string>;

/**
 * Finds triangulation groups in already-loaded matches. Lineage tags set by
 * the user override any lineage read from the CSV.
 */
export const buildTriangulationGroups = (
  loadedMatches: DNAMatch[],
  settings: TriangulationSettings,
  lineageTags: LineageTags = {},
  onProgress: (message: string) => void = () => {},
  genealogicalTree: GenealogicalTree | null = null
): TriangulationGroup[] => {
  // Each person's total shared cM across all their uploaded segments. Relationships
  // are predicted per person from this, never from a group's combined cM: a group of
  // 100 people sharing 20 cM each is 100 distant cousins, not one 2,000 cM relative.
  const totalsByPerson = new Map<string, number>();
  for (const match of loadedMatches) {
    const person = canonicalizeName(match.matchName);
    totalsByPerson.set(person, (totalsByPerson.get(person) ?? 0) + match.sizeCM);
  }
  
  // Copy so grouping never mutates the loaded matches
  const matches = loadedMatches.filter(match => match.sizeCM >= settings.minimumSize).map(match => {
    const person = canonicalizeName(match.matchName);
    const tag = lineageTags[person];
    const totalSharedCM = totalsByPerson.get(person) ?? match.sizeCM;
    return {
      ...match,
      lineage: tag !== undefined ? (tag || undefined) : match.lineage,
      totalSharedCM,
      relationshipPrediction: settings.enableRelationshipPrediction ? predictRelationship(totalSharedCM) : undefined
    };
  });
  
  // Link matches to the tree here (not when loading) so a GEDCOM uploaded after
  // calculating still applies
  if (genealogicalTree && settings.enableCrossVerification) {
    onProgress('Enriching DNA matches with genealogical tree data...');
    for (const match of matches) {
      populateDNAMatchTreeInfo(match, genealogicalTree);
    }
  }
  
  onProgress(`Processing ${matches.length} deduplicated DNA segments...`);
  
  // Find triangulations
  const triangulationGroups = findTriangulations(matches, settings, onProgress, genealogicalTree);
  
  // Apply enhanced analysis if enabled
  if (settings.enableRelationshipPrediction || settings.enableConfidenceScoring) {
    onProgress('Applying enhanced analysis...');
    triangulationGroups.forEach(group => {
      // Calculate confidence score
      if (settings.enableConfidenceScoring) {
        const totalCM = typicalMemberTotal(group.matches);
        const averageOverlap = calculateAverageOverlap(group.matches);
        group.confidenceScore = calculateConfidenceScore(
          group.averageSize,
          averageOverlap,
          group.matches.length,
          totalCM
        );
      }
      
      // Relationship of a typical member (median person), for the cousin-level filters
      if (settings.enableRelationshipPrediction) {
        group.relationshipPrediction = predictRelationship(typicalMemberTotal(group.matches));
      }
    });
  }
  
  onProgress(`Analysis complete: Found ${triangulationGroups.length} triangulation groups`);
  
  return triangulationGroups;
};

/** Median total shared cM across the distinct people in a group */
const typicalMemberTotal = (matches: DNAMatch[]): number => {
  const totals = new Map<string, number>();
  for (const match of matches) {
    totals.set(canonicalizeName(match.matchName), match.totalSharedCM ?? match.sizeCM);
  }
  const sorted = Array.from(totals.values()).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Links a DNA match to people in your tree who share a surname with it (from the
 * match's own name or its listed ancestral surnames), or who have the same name.
 * Surnames must match exactly so short names like "Li" don't match "Williams".
 */
const populateDNAMatchTreeInfo = (match: DNAMatch, genealogicalTree: GenealogicalTree): void => {
  const candidateSurnames = new Set(
    [...extractSurnamesFromName(match.matchName), ...(match.ancestralSurnames || [])]
      .map(surname => surname.trim().toLowerCase())
      .filter(surname => surname.length > 1)
  );
  const matchNameLower = match.matchName.trim().toLowerCase();
  
  const linkedSurnames = new Set<string>();
  const linkedPeople = new Set<string>();
  for (const individual of genealogicalTree.individuals) {
    const sharedSurnames = individual.surnames.filter(surname => candidateSurnames.has(surname.toLowerCase()));
    if (sharedSurnames.length > 0 || individual.name.toLowerCase() === matchNameLower) {
      sharedSurnames.forEach(surname => linkedSurnames.add(surname));
      linkedPeople.add(individual.name);
    }
  }
  
  match.treeMatchInfo = linkedPeople.size > 0
    ? [{
        matchName: match.matchName,
        treeIndividuals: Array.from(linkedPeople),
        commonSurnames: Array.from(linkedSurnames),
        suggestedAncestors: Array.from(linkedPeople)
      }]
    : undefined;
};

/**
 * Adds tree context to groups without changing them: the tree surnames carried by
 * the group's members, and the surname lines shared by two or more of them.
 * (Groups used to be split per tree person and dropped when fewer than the
 * minimum matches linked to one person, which removed nearly every group.)
 */
const annotateGroupsWithTree = (groups: TriangulationGroup[]): void => {
  for (const group of groups) {
    const peopleBySurname = new Map<string, Set<string>>();
    const treeMatchesByPerson = new Map<string, TreeMatchInfo>();
    for (const match of group.matches) {
      const person = canonicalizeName(match.matchName);
      for (const info of match.treeMatchInfo || []) {
        treeMatchesByPerson.set(person, info);
        for (const surname of info.commonSurnames) {
          if (!peopleBySurname.has(surname)) peopleBySurname.set(surname, new Set());
          peopleBySurname.get(surname)!.add(person);
        }
      }
    }
    
    const totalPeople = countDistinctPeople(group.matches);
    const lines = Array.from(peopleBySurname.entries())
      .sort(([a, aPeople], [b, bPeople]) => bPeople.size - aPeople.size || a.localeCompare(b));
    
    group.surnames = lines.map(([surname]) => surname);
    const sharedLines = lines
      .filter(([, people]) => people.size >= 2)
      .map(([surname, people]) => `${surname} line (${people.size} of ${totalPeople} matches)`);
    group.commonAncestors = sharedLines.length > 0 ? sharedLines : undefined;
    group.treeMatches = treeMatchesByPerson.size > 0 ? Array.from(treeMatchesByPerson.values()) : undefined;
  }
};

export const deduplicateAndMergeMatches = (rawMatches: RawDNAMatch[], onProgress: (message: string) => void = () => {}): DNAMatch[] => {
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
        lineage: match.lineage,
        ancestralSurnames: new Set(match.ancestralSurnames || []),
        locations: new Set(match.locations || []),
        notes: new Set(match.notes ? [match.notes] : []),
        sourceFiles: new Set([match.sourceFile])
      });
    }
    
    const profile = profileMap.get(canonicalName)!;
    
    // Add this segment to the profile, skipping exact duplicates (the same
    // segment exported in more than one file would otherwise be counted twice)
    const isDuplicateSegment = profile.segments.some(existing =>
      existing.chromosome === match.chromosome &&
      existing.startPosition === match.startPosition &&
      existing.endPosition === match.endPosition
    );
    if (!isDuplicateSegment) {
      profile.segments.push(match);
    }
    profile.nameVariations.add(match.matchName);
    profile.sourceFiles.add(match.sourceFile);
    
    // Merge metadata (prioritize first non-empty values for single-value fields)
    if (!profile.yHaplogroup && match.yHaplogroup) {
      profile.yHaplogroup = match.yHaplogroup;
    }
    if (!profile.mtHaplogroup && match.mtHaplogroup) {
      profile.mtHaplogroup = match.mtHaplogroup;
    }
    if (!profile.lineage && match.lineage) {
      profile.lineage = match.lineage;
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
        lineage: profile.lineage,
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

export const canonicalizeName = (name: string): string => {
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

export const parseMatchesFromCSV = (csvData: CSVRow[], fileName: string, settings: TriangulationSettings): { matches: DNAMatch[], issues: string[] } => {
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
      const chromosome = parseChromosome(chromosomeField);
      
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
      const lineage = normalizeLineage(row['Lineage'] || row['lineage']);
      
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
        if (lineage) match.lineage = lineage;
        
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

export const findTriangulations = (
  matches: DNAMatch[], 
  settings: TriangulationSettings,
  onProgress: (message: string) => void = () => {},
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
  
  const finalGroups = initialTriangulationGroups;
  if (genealogicalTree && settings.enableCrossVerification) {
    onProgress('Adding family tree surname lines to groups...');
    annotateGroupsWithTree(finalGroups);
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
  
  // Assign stable IDs so selection and annotations survive filtering, sorting and paging
  finalGroups.forEach((group, index) => {
    group.id = index;
    const { lineage, conflict } = summarizeLineage(group.matches);
    group.lineage = lineage;
    group.lineageConflict = conflict;
  });
  
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
    const people = new Set([canonicalizeName(baseMatch.matchName)]);
    let groupLineage = baseMatch.lineage;
    
    // The region shared by every member of the group so far. Each new member
    // is tested against this region (not just the base match) so that all
    // members genuinely share the same stretch of DNA.
    let regionStart = baseMatch.startPosition;
    let regionEnd = baseMatch.endPosition;
    
    for (let j = i + 1; j < matches.length; j++) {
      if (processedMatches.has(j)) continue;
      
      const testMatch = matches[j];
      
      // If the test match starts after the shared region ends, no more overlaps possible
      if (testMatch.startPosition >= regionEnd) {
        break;
      }
      
      // A person cannot triangulate with themselves
      const person = canonicalizeName(testMatch.matchName);
      if (people.has(person)) continue;
      
      // Matches tagged to different branches sit on different copies of the
      // chromosome (or different ancestors), so they cannot triangulate
      if (settings.separateByLineage && groupLineage && testMatch.lineage &&
          !lineagesCompatible(groupLineage, testMatch.lineage)) {
        continue;
      }
      
      const overlapStart = Math.max(regionStart, testMatch.startPosition);
      const overlapEnd = Math.min(regionEnd, testMatch.endPosition);
      
      if (overlapEnd > overlapStart) {
        const overlapSize = overlapEnd - overlapStart;
        const regionSize = regionEnd - regionStart;
        const testSize = testMatch.endPosition - testMatch.startPosition;
        const minSize = Math.min(regionSize, testSize);
        
        // Check if overlap is significant enough
        if (overlapSize / minSize >= settings.overlapThreshold) {
          overlappingMatches.push(testMatch);
          overlappingIndices.push(j);
          people.add(person);
          groupLineage = mergeLineages(groupLineage, testMatch.lineage);
          regionStart = overlapStart;
          regionEnd = overlapEnd;
        }
      }
    }
    
    // If we have enough distinct people for triangulation, create a group
    if (people.size >= settings.minimumMatches) {
      const totalSize = overlappingMatches.reduce((sum, match) => sum + match.sizeCM, 0);
      const averageSize = totalSize / overlappingMatches.length;
      
      triangulationGroups.push({
        id: 0, // Assigned after sorting
        chromosome: baseMatch.chromosome,
        startPosition: regionStart,
        endPosition: regionEnd,
        matches: overlappingMatches,
        averageSize,
        totalSize,
        confidenceScore: 0 // Will be calculated later
      });
      
      // Mark these matches as processed
      overlappingIndices.forEach(index => processedMatches.add(index));
    }
  }
  
  return triangulationGroups;
};

const countDistinctPeople = (matches: DNAMatch[]): number =>
  new Set(matches.map(match => canonicalizeName(match.matchName))).size;

/**
 * Parses a chromosome value such as "7", "chr7", "X" or "chrX".
 * The X chromosome is represented as 23.
 */
export const parseChromosome = (value: string | undefined): number => {
  if (!value) return NaN;
  const normalized = value.trim().toUpperCase().replace(/^CHR(OMOSOME)?\s*/, '');
  if (normalized === 'X') return 23;
  return /^\d+$/.test(normalized) ? parseInt(normalized, 10) : NaN;
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