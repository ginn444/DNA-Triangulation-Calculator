import { GenealogicalTree, TreeIndividual, TreeRelationship } from '../types/triangulation';

export const parseGEDCOM = async (file: File): Promise<GenealogicalTree> => {
  const text = await file.text();
  const lines = text.split('\n');
  
  const individuals: TreeIndividual[] = [];
  const relationships: TreeRelationship[] = [];
  const individualMap = new Map<string, TreeIndividual>();
  
  let currentIndividual: Partial<TreeIndividual> | null = null;
  let currentFamily: { id: string; husband?: string; wife?: string; children: string[] } | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const parts = trimmed.split(/\s+/, 3);
    const level = parseInt(parts[0]);
    const tag = parts[1];
    const value = parts[2] || '';
    
    if (level === 0) {
      // Save previous individual/family
      if (currentIndividual && currentIndividual.id) {
        const individual: TreeIndividual = {
          id: currentIndividual.id,
          name: currentIndividual.name || 'Unknown',
          surnames: currentIndividual.surnames || [],
          birthDate: currentIndividual.birthDate,
          deathDate: currentIndividual.deathDate,
          locations: currentIndividual.locations || []
        };
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
              relationshipType: 'parent-child'
            });
          }
          if (currentFamily.wife) {
            relationships.push({
              id: `rel_${currentFamily.id}_mother_${child}`,
              individual1: currentFamily.wife,
              individual2: child,
              relationshipType: 'parent-child'
            });
          }
        }
      }
      
      // Start new individual or family
      if (tag.startsWith('@I')) {
        currentIndividual = { id: tag };
        currentFamily = null;
      } else if (tag.startsWith('@F')) {
        currentFamily = { id: tag, children: [] };
        currentIndividual = null;
      } else {
        currentIndividual = null;
        currentFamily = null;
      }
    } else if (level === 1) {
      if (currentIndividual) {
        switch (tag) {
          case 'NAME':
            const nameParts = value.split('/');
            const firstName = nameParts[0]?.trim() || '';
            const lastName = nameParts[1]?.trim() || '';
            const surnames = lastName ? [lastName] : [];
            currentIndividual.name = `${firstName} ${lastName}`.trim();
            currentIndividual.surnames = surnames;
            break;
          case 'BIRT':
            // Birth event started
            break;
          case 'DEAT':
            // Death event started
            break;
          case 'PLAC':
            if (!currentIndividual.locations) currentIndividual.locations = [];
            currentIndividual.locations.push(value);
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
            // This is a simplified date parser
            if (value.includes('BIRT')) {
              currentIndividual.birthDate = value;
            } else if (value.includes('DEAT')) {
              currentIndividual.deathDate = value;
            }
            break;
        }
      }
    }
  }
  
  // Save the last individual/family
  if (currentIndividual && currentIndividual.id) {
    const individual: TreeIndividual = {
      id: currentIndividual.id,
      name: currentIndividual.name || 'Unknown',
      surnames: currentIndividual.surnames || [],
      birthDate: currentIndividual.birthDate,
      deathDate: currentIndividual.deathDate,
      locations: currentIndividual.locations || []
    };
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