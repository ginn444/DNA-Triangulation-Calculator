import { CSVRow } from '../types/triangulation';

// Header mapping for different CSV formats
const HEADER_MAPPINGS = {
  // Chromosome and position fields
  chromosome: ['Chromosome', 'chromosome', 'CHR', 'chr'],
  startPosition: ['Start Location', 'Start Position', 'start_position', 'start', 'Start'],
  endPosition: ['End Location', 'End Position', 'end_position', 'end', 'End'],
  
  // Size and overlap fields
  sizeCM: ['Overlap cM', 'Shared DNA', 'Size (cM)', 'cM', 'centimorgans', 'Centimorgans'],
  
  // Match information
  matchName: [
    'Match Names', 'Match Name', 'Name', 'Full Name', 'Match', 'Matches',
    'First Name', 'Last Name', 'Middle Name'
  ],
  matchCount: ['Matches Count', 'Match Count', 'Number of Matches', 'Count'],
  
  // Additional fields that might be present
  relationshipRange: ['Relationship Range', 'Relationship', 'Predicted Relationship'],
  longestBlock: ['Longest Block', 'Longest Segment', 'Largest Block'],
  linkedRelationship: ['Linked Relationship', 'Linked', 'Connection'],
  ancestralSurnames: ['Ancestral Surnames', 'Surnames', 'Family Names'],
  yHaplogroup: ['Y-DNA Haplogroup', 'Y Haplogroup', 'Paternal Haplogroup'],
  mtHaplogroup: ['mtDNA Haplogroup', 'mt Haplogroup', 'Maternal Haplogroup'],
  notes: ['Notes', 'Note', 'Comments', 'Description'],
  matchingBucket: ['Matching Bucket', 'Bucket', 'Group'],
  xMatch: ['X-Match', 'X Match', 'X Chromosome Match'],
  autosomalTransfer: ['Autosomal Transfer', 'Transfer', 'Autosomal'],
  matchDate: ['Match Date', 'Date', 'Match Found', 'Discovery Date'],
  markersTested: ['Markers Tested', 'Markers', 'SNPs Tested'],
  geneticDistance: ['Genetic Distance', 'Distance', 'GD'],
  bigYStrDifferences: ['Big Y STR Differences', 'STR Differences', 'Y-STR'],
  paternalCountry: ['Paternal Country of Origin', 'Paternal Origin', 'Y-Origin'],
  earliestAncestor: ['Earliest Known Ancestor', 'Earliest Ancestor', 'Known Ancestor']
};

export const parseCSV = async (file: File): Promise<CSVRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.trim().split('\n');
        
        if (rows.length < 2) {
          reject(new Error(`File ${file.name} appears to be empty or has no data rows`));
          return;
        }

        // Parse header
        const rawHeaders = parseCSVRow(rows[0]);
        console.log(`File ${file.name} - Raw headers:`, rawHeaders);
        
        // Create header mapping for this file
        const headerMapping = createHeaderMapping(rawHeaders);
        console.log(`File ${file.name} - Header mapping:`, headerMapping);
        
        // Parse data rows
        const data: CSVRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i].trim();
          if (row) {
            const values = parseCSVRow(row);
            if (values.length === rawHeaders.length) {
              const rowData: CSVRow = {};
              
              // Map values using the header mapping
              rawHeaders.forEach((header, index) => {
                const mappedKey = headerMapping[header];
                if (mappedKey) {
                  rowData[mappedKey] = values[index]?.trim() || '';
                } else {
                  // Keep original header for unmapped fields
                  rowData[header.trim()] = values[index]?.trim() || '';
                }
              });
              
              data.push(rowData);
            }
          }
        }
        
        console.log(`File ${file.name} - Parsed ${data.length} rows`);
        resolve(data);
      } catch (error) {
        reject(new Error(`Error parsing CSV file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error(`Error reading file ${file.name}`));
    };
    
    reader.readAsText(file);
  });
};

const createHeaderMapping = (headers: string[]): Record<string, string> => {
  const mapping: Record<string, string> = {};
  
  headers.forEach(header => {
    const trimmedHeader = header.trim();
    
    // Find which standard field this header maps to
    for (const [standardField, variations] of Object.entries(HEADER_MAPPINGS)) {
      if (variations.some(variation => 
        trimmedHeader.toLowerCase() === variation.toLowerCase() ||
        trimmedHeader.toLowerCase().includes(variation.toLowerCase()) ||
        variation.toLowerCase().includes(trimmedHeader.toLowerCase())
      )) {
        mapping[trimmedHeader] = standardField;
        break;
      }
    }
    
    // If no mapping found, keep the original header
    if (!mapping[trimmedHeader]) {
      mapping[trimmedHeader] = trimmedHeader;
    }
  });
  
  return mapping;
};

const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Handle escaped quotes
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
};

// Helper function to get detected headers for debugging
export const getDetectedHeaders = (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.trim().split('\n');
        
        if (rows.length === 0) {
          reject(new Error('File is empty'));
          return;
        }

        const headers = parseCSVRow(rows[0]);
        resolve(headers.map(h => h.trim()));
      } catch (error) {
        reject(new Error(`Error reading headers: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error(`Error reading file ${file.name}`));
    };
    
    reader.readAsText(file);
  });
};