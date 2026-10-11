import { DNAMatch, EvidenceLevel, TriangulationGroup, CSVRow, TriangulationSettings, GenealogicalTree, TreeMatchInfo } from '../types/triangulation';
import { parseCSV } from './csvParser';
import { predictRelationship } from './relationshipPredictor';
import { lineagesCompatible, mergeLineages, normalizeLineage, summarizeLineage } from './lineage';

const DEFAULT_SETTINGS: TriangulationSettings = {
  minimumSize: 7, // 7 cM minimum
  minimumMatches: 3, // At least 3 people for triangulation
  minimumOverlapCM: 7, // Everyone must share at least 7 cM
  enableRelationshipPrediction: true,
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
  
  // Evidence level from the shared stretch size and how crowded that stretch is
  onProgress('Checking for pile-up regions...');
  const coverage = buildCoverageMap(matches);
  for (const group of triangulationGroups) {
    group.regionMatchCount = coverage.peopleInRegion(group.chromosome, group.startPosition, group.endPosition);
    group.evidence = classifyEvidence(group.sharedCM, group.regionMatchCount, coverage.pileUpThreshold);
    group.confidenceScore = EVIDENCE_RANK[group.evidence];
    
    // Relationship of a typical member (median person), for the cousin-level filters
    if (settings.enableRelationshipPrediction) {
      group.relationshipPrediction = predictRelationship(typicalMemberTotal(group.matches));
    }
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

/**
 * A new member must keep at least this share of the anchor segment in common with
 * the group, so a match that overlaps only the edge of a strong family cluster
 * cannot shrink everyone's shared stretch down to the bare minimum.
 */
const ANCHOR_SHARE = 0.5;

/**
 * A new member must also cover at least this share of the stretch the group's first
 * pair shares (measured against that pair, so the shrinkage cannot compound), so
 * later, weaker overlaps cannot whittle a strong cluster down.
 */
const GROUP_SHARE = 0.7;

interface Cluster {
  indices: number[];
  people: number;
  regionStart: number;
  regionEnd: number;
  sharedCM: number;
}

/**
 * Builds the best group around one anchor segment from the segments not yet used:
 * closest overlaps first, keeping only members that leave everyone sharing enough.
 */
const buildCluster = (
  anchor: number,
  matches: DNAMatch[],
  used: Set<number>,
  settings: TriangulationSettings
): Cluster | null => {
  const baseMatch = matches[anchor];
  if (baseMatch.sizeCM < settings.minimumOverlapCM) return null;
  
  const baseRate = cmPerBasePair(baseMatch);
  const requiredCM = Math.max(settings.minimumOverlapCM, baseMatch.sizeCM * ANCHOR_SHARE);
  
  const candidates: { index: number; overlapCM: number }[] = [];
  for (let j = 0; j < matches.length; j++) {
    if (j === anchor || used.has(j)) continue;
    const other = matches[j];
    const overlapBp = Math.min(baseMatch.endPosition, other.endPosition) - Math.max(baseMatch.startPosition, other.startPosition);
    if (overlapBp <= 0) continue;
    const overlapCM = overlapBp * Math.min(baseRate, cmPerBasePair(other));
    if (overlapCM >= requiredCM) candidates.push({ index: j, overlapCM });
  }
  candidates.sort((a, b) => b.overlapCM - a.overlapCM);
  
  const indices = [anchor];
  const people = new Set([canonicalizeName(baseMatch.matchName)]);
  let groupLineage = baseMatch.lineage;
  // The stretch shared by every member so far, and the lowest cM-per-base-pair
  // among members so its cM is estimated conservatively
  let regionStart = baseMatch.startPosition;
  let regionEnd = baseMatch.endPosition;
  let minRate = baseRate;
  let coreCM = 0; // Shared cM of the anchor and its first (closest) member
  
  for (const { index: j } of candidates) {
    const testMatch = matches[j];
    
    // A person cannot triangulate with themselves
    const person = canonicalizeName(testMatch.matchName);
    if (people.has(person)) continue;
    
    // Matches tagged to different branches sit on different copies of the
    // chromosome (or different ancestors), so they cannot triangulate
    if (settings.separateByLineage && groupLineage && testMatch.lineage &&
        !lineagesCompatible(groupLineage, testMatch.lineage)) {
      continue;
    }
    
    // Only add a member if everyone would still share enough. Without this floor
    // each new member narrows the shared stretch until it is too short (often
    // well under 1 cM) to be evidence of a common ancestor.
    const newStart = Math.max(regionStart, testMatch.startPosition);
    const newEnd = Math.min(regionEnd, testMatch.endPosition);
    if (newEnd <= newStart) continue;
    const rate = Math.min(minRate, cmPerBasePair(testMatch));
    const newCM = (newEnd - newStart) * rate;
    if (newCM < requiredCM) continue;
    if (indices.length >= 2 && newCM < coreCM * GROUP_SHARE) continue;
    
    if (indices.length === 1) coreCM = newCM;
    indices.push(j);
    people.add(person);
    groupLineage = mergeLineages(groupLineage, testMatch.lineage);
    regionStart = newStart;
    regionEnd = newEnd;
    minRate = rate;
  }
  
  if (people.size < settings.minimumMatches) return null;
  return {
    indices,
    people: people.size,
    regionStart,
    regionEnd,
    sharedCM: Math.round((regionEnd - regionStart) * minRate * 10) / 10
  };
};

/**
 * The size of the stretch everyone shares is the evidence, so prefer the larger
 * shared stretch, then more people
 */
const isBetterCluster = (a: Cluster, b: Cluster): boolean =>
  a.sharedCM > b.sharedCM || (a.sharedCM === b.sharedCM && a.people > b.people);

const findTriangulationsOnChromosome = (
  matches: DNAMatch[], 
  settings: TriangulationSettings
): TriangulationGroup[] => {
  const triangulationGroups: TriangulationGroup[] = [];
  const used = new Set<number>();
  
  // Work out the group each segment would anchor, then repeatedly keep the best
  // one (so a tight family cluster is formed before unrelated partial overlaps
  // can split it) and rebuild only the candidate groups it affected
  const clusters = new Map<number, Cluster | null>();
  matches.forEach((_, index) => clusters.set(index, buildCluster(index, matches, used, settings)));
  
  for (;;) {
    let best: Cluster | null = null;
    for (const cluster of clusters.values()) {
      if (cluster && (!best || isBetterCluster(cluster, best))) best = cluster;
    }
    if (!best) break;
    
    const groupMatches = best.indices.map(index => matches[index]);
    const totalSize = groupMatches.reduce((sum, match) => sum + match.sizeCM, 0);
    triangulationGroups.push({
      id: 0, // Assigned after sorting
      chromosome: groupMatches[0].chromosome,
      startPosition: best.regionStart,
      endPosition: best.regionEnd,
      matches: groupMatches,
      averageSize: totalSize / groupMatches.length,
      totalSize,
      sharedCM: best.sharedCM,
      // Set after grouping
      confidenceScore: 0,
      evidence: 'moderate',
      regionMatchCount: 0
    });
    
    // Members are used up; any anchor overlapping them may now form a different group
    best.indices.forEach(index => {
      used.add(index);
      clusters.delete(index);
    });
    const spanStart = Math.min(...groupMatches.map(m => m.startPosition));
    const spanEnd = Math.max(...groupMatches.map(m => m.endPosition));
    for (const index of clusters.keys()) {
      const anchor = matches[index];
      if (anchor.startPosition < spanEnd && anchor.endPosition > spanStart) {
        clusters.set(index, buildCluster(index, matches, used, settings));
      }
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

/** A segment's cM per base pair (genetic distance varies along chromosomes, so use each segment's own rate) */
const cmPerBasePair = (match: DNAMatch): number =>
  match.sizeCM / Math.max(1, match.endPosition - match.startPosition);

const EVIDENCE_RANK: Record<EvidenceLevel, number> = { strong: 90, moderate: 60, 'pile-up': 20 };

/** Segments of 15 cM or more are almost always identical by descent (ISOGG) */
const STRONG_SHARED_CM = 15;

export const classifyEvidence = (sharedCM: number, regionMatchCount: number, pileUpThreshold: number): EvidenceLevel => {
  if (regionMatchCount > pileUpThreshold) return 'pile-up';
  return sharedCM >= STRONG_SHARED_CM ? 'strong' : 'moderate';
};

const BIN_SIZE = 1_000_000;

/**
 * Counts how many distinct matches cover each 1 Mb stretch of each chromosome.
 * A stretch covered by far more matches than is typical for this upload (3x the
 * median covered stretch, and at least 10 matches) is treated as a pile-up region.
 */
export const buildCoverageMap = (matches: DNAMatch[]) => {
  const bins = new Map<string, Set<string>>();
  for (const match of matches) {
    const person = canonicalizeName(match.matchName);
    const first = Math.floor(match.startPosition / BIN_SIZE);
    const last = Math.floor(match.endPosition / BIN_SIZE);
    for (let bin = first; bin <= last; bin++) {
      const key = `${match.chromosome}:${bin}`;
      if (!bins.has(key)) bins.set(key, new Set());
      bins.get(key)!.add(person);
    }
  }
  
  const counts = Array.from(bins.values()).map(people => people.size).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const pileUpThreshold = Math.max(10, median * 3);
  
  const peopleInRegion = (chromosome: number, start: number, end: number): number => {
    let most = 0;
    for (let bin = Math.floor(start / BIN_SIZE); bin <= Math.floor(end / BIN_SIZE); bin++) {
      most = Math.max(most, bins.get(`${chromosome}:${bin}`)?.size ?? 0);
    }
    return most;
  };
  
  return { pileUpThreshold, peopleInRegion };
};
