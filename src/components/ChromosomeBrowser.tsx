import React from 'react';
import { TriangulationGroup, DNAMatch } from '../types/triangulation';

interface ChromosomeBrowserProps {
  groups: TriangulationGroup[];
  selectedGroup?: number;
  onGroupSelect?: (groupId: number) => void;
  width?: number;
  height?: number;
}

export const ChromosomeBrowser: React.FC<ChromosomeBrowserProps> = ({
  groups,
  selectedGroup,
  onGroupSelect,
  width = 800,
  height = 400
}) => {
  const chromosomeHeight = 30;
  const margin = 20;
  const chromosomeWidth = width - 2 * margin;
  
  // Group by chromosome
  const groupsByChromosome = new Map<number, TriangulationGroup[]>();
  for (const group of groups) {
    if (!groupsByChromosome.has(group.chromosome)) {
      groupsByChromosome.set(group.chromosome, []);
    }
    groupsByChromosome.get(group.chromosome)!.push(group);
  }
  
  // Chromosome lengths in base pairs (approximate)
  const chromosomeLengths: Record<number, number> = {
    1: 248956422, 2: 242193529, 3: 198295559, 4: 190214555, 5: 181538259,
    6: 170805979, 7: 159345973, 8: 145138636, 9: 138394717, 10: 133797422,
    11: 135086622, 12: 133275309, 13: 114364328, 14: 107043718, 15: 101991189,
    16: 90338345, 17: 83257441, 18: 80373285, 19: 58617616, 20: 64444167,
    21: 46709983, 22: 50818468, 23: 156040895
  };
  
  const getSegmentColor = (groupId: number, isSelected: boolean) => {
    if (isSelected) return '#ef4444'; // Red for selected
    const colors = [
      '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
      '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
    return colors[groupId % colors.length];
  };
  
  const renderChromosome = (chromosome: number, groups: TriangulationGroup[], yOffset: number) => {
    const length = chromosomeLengths[chromosome] || 100000000;
    
    return (
      <g key={chromosome} transform={`translate(${margin}, ${yOffset})`}>
        {/* Chromosome outline */}
        <rect
          x={0}
          y={0}
          width={chromosomeWidth}
          height={chromosomeHeight}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={2}
          rx={4}
        />
        
        {/* Chromosome label */}
        <text
          x={-10}
          y={chromosomeHeight / 2}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize={12}
          fontWeight="bold"
          fill="#374151"
        >
          {chromosome}
        </text>
        
        {/* Segments */}
        {groups.map((group, index) => {
          const startX = (group.startPosition / length) * chromosomeWidth;
          const endX = (group.endPosition / length) * chromosomeWidth;
          const segmentWidth = endX - startX;
          const isSelected = selectedGroup === index;
          
          return (
            <g key={index}>
              <rect
                x={startX}
                y={2}
                width={segmentWidth}
                height={chromosomeHeight - 4}
                fill={getSegmentColor(index, isSelected)}
                opacity={isSelected ? 0.8 : 0.6}
                stroke={isSelected ? '#dc2626' : 'none'}
                strokeWidth={isSelected ? 2 : 0}
                rx={2}
                cursor="pointer"
                onClick={() => onGroupSelect?.(index)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = isSelected ? '0.8' : '0.6';
                }}
              />
              
              {/* Tooltip */}
              <title>
                Group {index + 1}: {group.matches.length} matches
                {group.startPosition.toLocaleString()} - {group.endPosition.toLocaleString()}
                ({group.averageSize.toFixed(1)} cM avg)
              </title>
            </g>
          );
        })}
      </g>
    );
  };
  
  const chromosomes = Array.from(groupsByChromosome.entries())
    .sort(([a], [b]) => a - b);
  
  const totalHeight = chromosomes.length * (chromosomeHeight + 10) + margin * 2;
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Chromosome Browser</h3>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={Math.max(height, totalHeight)}
          className="border border-gray-200 rounded"
        >
          {chromosomes.map(([chromosome, groups], index) => 
            renderChromosome(chromosome, groups, margin + index * (chromosomeHeight + 10))
          )}
          
          {/* Legend */}
          <g transform={`translate(${margin}, ${totalHeight - 40})`}>
            <text x={0} y={0} fontSize={12} fontWeight="bold" fill="#374151">
              Legend:
            </text>
            <rect x={60} y={-8} width={12} height={12} fill="#3b82f6" opacity={0.6} />
            <text x={80} y={0} fontSize={10} fill="#6b7280">
              Triangulation Groups
            </text>
            <rect x={180} y={-8} width={12} height={12} fill="#ef4444" opacity={0.8} />
            <text x={200} y={0} fontSize={10} fill="#6b7280">
              Selected Group
            </text>
          </g>
        </svg>
      </div>
      
      {selectedGroup !== undefined && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-800 mb-2">
            Selected Group {selectedGroup + 1}
          </h4>
          {groups[selectedGroup] && (
            <div className="text-sm text-blue-700">
              <p>Chromosome {groups[selectedGroup].chromosome}</p>
              <p>{groups[selectedGroup].matches.length} matches</p>
              <p>Average size: {groups[selectedGroup].averageSize.toFixed(1)} cM</p>
              <p>Confidence: {groups[selectedGroup].confidenceScore}%</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 