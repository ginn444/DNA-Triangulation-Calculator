import { GenealogicalTree, TreeIndividual, TreeRelationship } from '../types/triangulation';

const finishIndividual = (partial: Partial<TreeIndividual>): TreeIndividual => ({
  id: partial.id!,
  name: partial.name || 'Unknown',
  surnames: partial.surnames || [],
  sex: partial.sex,
  birthDate: partial.birthDate,
  deathDate: partial.deathDate,
  birthPlace: partial.birthPlace,
  locations: partial.locations || []
});

export const parseGEDCOM = async (file: File): Promise<GenealogicalTree> => {
  return parseGEDCOMText(await file.text());
};

export const parseGEDCOMText = (text: string): GenealogicalTree => {
  // GEDCOM files may use CRLF (Windows), LF (Unix) or CR-only (classic Mac,
  // e.g. MacFamilyTree) line endings, and may start with a byte order mark
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  
  const individuals: TreeIndividual[] = [];
  const relationships: TreeRelationship[] = [];
  const individualMap = new Map<string, TreeIndividual>();
  
  let currentIndividual: Partial<TreeIndividual> | null = null;
  let currentFamily: { id: string; husband?: string; wife?: string; children: string[] } | null = null;
  let currentEvent = ''; // The level-1 tag (BIRT, DEAT, RESI, ...) that level-2 DATE/PLAC lines belong to
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // "LEVEL TAG VALUE", where VALUE is the rest of the line and may contain spaces
    // (split(/\s+/, 3) would drop everything after the first word of the value)
    const parsed = trimmed.match(/^(\d+)\s+(\S+)(?:\s(.*))?$/);
    if (!parsed) continue;
    const level = parseInt(parsed[1]);
    const tag = parsed[2];
    const value = (parsed[3] || '').trim();
    
    if (level === 0) {
      // Save previous individual/family
      if (currentIndividual && currentIndividual.id) {
        const individual = finishIndividual(currentIndividual);
        individuals.push(individual);
        individualMap.set(individual.id, individual);
      }
      
      if (currentFamily) {
        // Create relationships for family
        if (currentFamily.husband && currentFamily.wife) {
          relationships.push({
            id: `rel_${currentFamily.id}_spouse`,
            individual1: currentFamily.husband,
            individual2: currentFamily.wife,
            relationshipType: 'spouse'
          });
        }
        
        for (const child of currentFamily.children) {
          if (currentFamily.husband) {
            relationships.push({
              id: `rel_${currentFamily.id}_father_${child}`,
              individual1: currentFamily.husband,
              individual2: child,
              relationshipType: 'parent-child',
              parentRole: 'father'
            });
          }
          if (currentFamily.wife) {
            relationships.push({
              id: `rel_${currentFamily.id}_mother_${child}`,
              individual1: currentFamily.wife,
              individual2: child,
              relationshipType: 'parent-child',
              parentRole: 'mother'
            });
          }
        }
      }
      
      // Start new individual or family. Identify records by type ("0 @X1@ INDI"),
      // not by ID prefix: programs use many ID styles (@I1@, @P1@, @402699101126@)
      const recordType = value.trim().toUpperCase();
      if (recordType === 'INDI') {
        currentIndividual = { id: tag };
        currentFamily = null;
      } else if (recordType === 'FAM') {
        currentFamily = { id: tag, children: [] };
        currentIndividual = null;
      } else {
        currentIndividual = null;
        currentFamily = null;
      }
    } else if (level === 1) {
      currentEvent = tag;
      if (currentIndividual) {
        switch (tag) {
          case 'NAME': {
            // Keep the primary (first) name; later NAME lines are alternates
            if (currentIndividual.name) break;
            const nameParts = value.split('/');
            const firstName = nameParts[0]?.trim() || '';
            const lastName = nameParts[1]?.trim() || '';
            const surnames = lastName ? [lastName] : [];
            currentIndividual.name = `${firstName} ${lastName}`.trim();
            currentIndividual.surnames = surnames;
            break;
          }
          case 'SEX':
            if (value.toUpperCase() === 'M' || value.toUpperCase() === 'F') {
              currentIndividual.sex = value.toUpperCase() as 'M' | 'F';
            }
            break;
        }
      } else if (currentFamily) {
        switch (tag) {
          case 'HUSB':
            currentFamily.husband = value;
            break;
          case 'WIFE':
            currentFamily.wife = value;
            break;
          case 'CHIL':
            currentFamily.children.push(value);
            break;
        }
      }
    } else if (level === 2) {
      if (currentIndividual) {
        switch (tag) {
          case 'DATE':
            if (currentEvent === 'BIRT' && !currentIndividual.birthDate) {
              currentIndividual.birthDate = value;
            } else if (currentEvent === 'DEAT' && !currentIndividual.deathDate) {
              currentIndividual.deathDate = value;
            }
            break;
          case 'PLAC': {
            // "Gainesville,,Allen,Kentucky,USA" -> "Gainesville, Allen, Kentucky, USA"
            const place = value.split(',').map(part => part.trim()).filter(Boolean).join(', ');
            if (!place) break;
            if (currentEvent === 'BIRT' && !currentIndividual.birthPlace) currentIndividual.birthPlace = place;
            if (!currentIndividual.locations) currentIndividual.locations = [];
            if (!currentIndividual.locations.includes(place)) currentIndividual.locations.push(place);
            break;
          }
        }
      }
    }
  }
  
  // Save the last individual/family
  if (currentIndividual && currentIndividual.id) {
    const individual = finishIndividual(currentIndividual);
    individuals.push(individual);
    individualMap.set(individual.id, individual);
  }
  
  return { individuals, relationships };
};

export const extractSurnames = (individuals: TreeIndividual[]): string[] => {
  const surnames = new Set<string>();
  
  for (const individual of individuals) {
    for (const surname of individual.surnames) {
      if (surname && surname.trim()) {
        surnames.add(surname.trim().toLowerCase());
      }
    }
  }
  
  return Array.from(surnames);
};

export const findCommonAncestors = (
  surnames: string[],
  tree: GenealogicalTree
): TreeIndividual[] => {
  const matchingIndividuals: TreeIndividual[] = [];
  
  for (const individual of tree.individuals) {
    for (const surname of individual.surnames) {
      if (surnames.some(s => 
        surname.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(surname.toLowerCase())
      )) {
        matchingIndividuals.push(individual);
        break;
      }
    }
  }
  
  return matchingIndividuals;
}; 