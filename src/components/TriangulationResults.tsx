import React, { useState } from 'react';
import { Users, MapPin, TrendingUp, ChevronDown, ChevronUp, Tag, Star, TreePine, Dna, FileText } from 'lucide-react';
import { TriangulationGroup } from '../types/triangulation';
import { groupKey } from '../utils/triangulationEngine';
import { LINEAGE_OPTIONS, describeLineage, lineageImpossibleOnX } from '../utils/lineage';

interface TriangulationResultsProps {
  groups: TriangulationGroup[];
  onLineageChange?: (matchName: string, lineage: string) => void;
  selectedGroup?: number;
  onGroupSelect?: (groupId: number) => void;
}

export const TriangulationResults: React.FC<TriangulationResultsProps> = ({ 
  groups,
  onLineageChange,
  selectedGroup,
  onGroupSelect
}) => {
  // Keyed by groupKey so a group stays open when lineage tags regroup the results
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  // Get unique chromosomes for filter
  const chromosomes = [...new Set(groups.map(g => g.chromosome))].sort((a, b) => a - b);

  if (groups.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No Results Yet</h3>
          <p className="text-gray-600">
            Upload your chromosome browser CSV files and click "Calculate Triangulations" to find 
            overlapping DNA segments between your matches.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Triangulation Summary</h2>
        
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-blue-700">{groups.length}</div>
            <div className="text-sm text-blue-600">Triangulation Groups</div>
          </div>
          
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-green-700">{chromosomes.length}</div>
            <div className="text-sm text-green-600">Chromosomes Covered</div>
          </div>
          
          <div className="text-center p-4 bg-purple-50 rounded-xl">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-purple-700">
              {Math.round(groups.reduce((sum, g) => sum + g.averageSize, 0) / groups.length * 10) / 10}
            </div>
            <div className="text-sm text-purple-600">Avg. Size (cM)</div>
          </div>

          <div className="text-center p-4 bg-orange-50 rounded-xl">
            <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-orange-700">
              {Math.round(groups.reduce((sum, g) => sum + (g.confidenceScore || 0), 0) / groups.length)}
            </div>
            <div className="text-sm text-orange-600">Avg. Confidence</div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">Triangulation Groups</h2>
        </div>
        
        <div className="divide-y divide-gray-100">
          {groups.map(group => {
            const groupIndex = group.id;
            const key = groupKey(group);
            const isExpanded = expandedGroups.has(key);
            const isSelected = selectedGroup === groupIndex;
            
            return (
              <div 
                key={key} 
                className={`p-6 transition-colors duration-200 ${
                  isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
                onClick={() => onGroupSelect?.(groupIndex)}
              >
                <div 
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -m-2 p-2 rounded-lg transition-colors duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroup(key);
                  }}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${
                      isSelected 
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-700' 
                        : 'bg-gradient-to-br from-blue-500 to-purple-600'
                    }`}>
                      {groupIndex + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800">
                        Chromosome {group.chromosome === 23 ? 'X' : group.chromosome}
                      </div>
                      <div className="text-sm text-gray-600">
                        {group.matches.length} matches • {group.averageSize.toFixed(1)} cM avg • 
                        {group.startPosition.toLocaleString()}-{group.endPosition.toLocaleString()}
                      </div>
                      <LineageBadge group={group} />
                      {group.relationshipPrediction && (
                        <div className="text-xs text-blue-600 mt-1" title="Predicted from the median person's total shared cM, not the group's combined cM">
                          Typical match: {group.relationshipPrediction.relationship} ({group.relationshipPrediction.confidence} confidence)
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-800">
                        {group.totalSize.toFixed(1)} cM
                      </div>
                      <div className="text-xs text-gray-500">Total Size</div>
                      {group.confidenceScore > 0 && (
                        <div className="text-xs text-orange-600 font-medium">
                          {group.confidenceScore}% confidence
                        </div>
                      )}
                    </div>
                    
                    {/* Enhanced indicators */}
                    <div className="flex flex-col items-center space-y-1">
                      {/* Annotation indicator */}
                      {group.annotations && (
                        <div className="flex items-center text-xs text-gray-500">
                          <Tag className="w-3 h-3 mr-1" />
                          {group.annotations.surnames?.length || 0}
                        </div>
                      )}
                      
                      {/* Tree matches indicator */}
                      {group.treeMatches && group.treeMatches.length > 0 && (
                        <div className="flex items-center text-xs text-green-600">
                          <TreePine className="w-3 h-3 mr-1" />
                          {group.treeMatches.length}
                        </div>
                      )}
                      
                      {/* Haplogroup indicator */}
                      {group.matches.some(m => m.yHaplogroup || m.mtHaplogroup) && (
                        <div className="flex items-center text-xs text-purple-600">
                          <Dna className="w-3 h-3 mr-1" />
                          H
                        </div>
                      )}
                    </div>
                    
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-6 overflow-hidden">
                    {/* Enhanced match details table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Match Name</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Lineage</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Source File</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Start Position</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">End Position</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Size (cM)</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Total Shared</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">SNPs</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Y-Haplogroup</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">mtDNA</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Surnames</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.matches.map((match, matchIndex) => (
                            <tr key={matchIndex} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-800 font-medium">{match.matchName}</td>
                              <td className="py-3 px-4 text-gray-600" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={match.lineage || ''}
                                  onChange={(e) => onLineageChange?.(match.matchName, e.target.value)}
                                  disabled={!onLineageChange}
                                  title={match.lineage ? describeLineage(match.lineage) : 'Tag which line this match is related through'}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Untagged</option>
                                  {LINEAGE_OPTIONS.map((paths, generation) => (
                                    <optgroup key={generation} label={GENERATION_LABELS[generation]}>
                                      {paths.map(path => (
                                        <option key={path} value={path}>{path} · {describeLineage(path)}</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                {!match.lineage && group.lineage && (
                                  <div className="text-xs text-gray-400 mt-1" title="Inferred from the tagged matches in this group">
                                    likely {group.lineage}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-600">
                                {match.sourceFile ? (
                                  <div className="flex items-center">
                                    <FileText className="w-3 h-3 mr-1 text-gray-400" />
                                    <span className="text-xs truncate max-w-24" title={match.sourceFile}>
                                      {match.sourceFile}
                                    </span>
                                  </div>
                                ) : (
                                  'N/A'
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-600">{match.startPosition.toLocaleString()}</td>
                              <td className="py-3 px-4 text-gray-600">{match.endPosition.toLocaleString()}</td>
                              <td className="py-3 px-4 text-gray-600">{match.sizeCM.toFixed(2)}</td>
                              <td className="py-3 px-4 text-gray-600" title="This person's total cM across all uploaded segments">
                                {match.totalSharedCM !== undefined ? `${match.totalSharedCM.toFixed(1)} cM` : 'N/A'}
                                {match.relationshipPrediction && (
                                  <div className="text-xs text-blue-600">{match.relationshipPrediction.relationship}</div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-600">{match.matchingSNPs || 'N/A'}</td>
                              <td className="py-3 px-4 text-gray-600">
                                {match.yHaplogroup ? (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                    {match.yHaplogroup}
                                  </span>
                                ) : (
                                  'N/A'
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-600">
                                {match.mtHaplogroup ? (
                                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                                    {match.mtHaplogroup}
                                  </span>
                                ) : (
                                  'N/A'
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-600">
                                {match.ancestralSurnames ? (
                                  <div className="flex flex-wrap gap-1">
                                    {match.ancestralSurnames.slice(0, 3).map((surname, idx) => (
                                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                        {surname}
                                      </span>
                                    ))}
                                    {match.ancestralSurnames.length > 3 && (
                                      <span className="text-xs text-gray-500">
                                        +{match.ancestralSurnames.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  'N/A'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Enhanced genealogical information */}
                    {(group.treeMatches && group.treeMatches.length > 0) && (
                      <div className="mt-4 p-4 bg-green-50 rounded-lg">
                        <h4 className="font-medium text-green-800 mb-2 flex items-center">
                          <TreePine className="w-4 h-4 mr-2" />
                          Tree People Sharing a Surname With These Matches
                        </h4>
                        <div className="space-y-2">
                          {group.treeMatches.map((treeMatch, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium text-green-700">{treeMatch.matchName}:</span>
                              <span className="text-green-600 ml-2">
                                {treeMatch.treeIndividuals.join(', ')}
                              </span>
                              {treeMatch.commonSurnames.length > 0 && (
                                <div className="text-xs text-green-600 ml-4">
                                  Common surnames: {treeMatch.commonSurnames.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Common ancestors */}
                    {group.commonAncestors && group.commonAncestors.length > 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                        <h4 className="font-medium text-yellow-800 mb-1">Surname Lines Shared in Your Tree</h4>
                        <p className="text-xs text-yellow-700 mb-2">
                          Surnames in your tree carried by two or more matches in this group. A lead to research, not proof.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.commonAncestors.map((ancestor, idx) => (
                            <span key={idx} className="px-3 py-1 bg-yellow-200 text-yellow-800 text-sm rounded-full">
                              {ancestor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Annotations */}
                    {group.annotations && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-800 mb-2">Research Notes</h4>
                        {group.annotations.notes && (
                          <p className="text-sm text-gray-700 mb-2">{group.annotations.notes}</p>
                        )}
                        {group.annotations.surnames && group.annotations.surnames.length > 0 && (
                          <div className="text-sm text-gray-600 mb-1">
                            <span className="font-medium">Surnames:</span> {group.annotations.surnames.join(', ')}
                          </div>
                        )}
                        {group.annotations.locations && group.annotations.locations.length > 0 && (
                          <div className="text-sm text-gray-600 mb-1">
                            <span className="font-medium">Locations:</span> {group.annotations.locations.join(', ')}
                          </div>
                        )}
                        {group.annotations.tags && group.annotations.tags.length > 0 && (
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Tags:</span> {group.annotations.tags.join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
const GENERATION_LABELS = ['Parents', 'Grandparents', 'Great-grandparents', '2nd great-grandparents'];

const LineageBadge: React.FC<{ group: TriangulationGroup }> = ({ group }) => {
  const isX = group.chromosome === 23;

  if (group.lineageConflict) {
    return (
      <div
        className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700"
        title="Members are tagged to different branches. Turn on 'Separate Groups by Lineage' in Analysis Settings to split them."
      >
        Mixed lineage
      </div>
    );
  }

  if (!group.lineage) return null;

  const paternal = group.lineage.startsWith('P');
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <span
        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
          paternal ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
        }`}
        title="Most specific line shared by the tagged matches in this group"
      >
        {describeLineage(group.lineage)} ({group.lineage})
      </span>
      {isX && lineageImpossibleOnX(group.lineage) && (
        <span
          className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800"
          title="A father never passes his X chromosome to his son, so X DNA cannot come through a father's father. Check these tags."
        >
          Not possible on X
        </span>
      )}
    </div>
  );
};
