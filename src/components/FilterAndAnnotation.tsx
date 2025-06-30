import React, { useState } from 'react';
import { Filter, Search, Tag, MapPin, Users, Edit3, Save, X } from 'lucide-react';
import { FilterOptions, TriangulationGroup, GroupAnnotation } from '../types/triangulation';
import { extractGenerationNumber } from '../utils/relationshipPredictor';

interface FilterAndAnnotationProps {
  groups: TriangulationGroup[];
  filterOptions: FilterOptions;
  onFilterChange: (options: FilterOptions) => void;
  onAnnotationChange: (groupId: number, annotation: GroupAnnotation) => void;
  selectedGroup?: number;
  onGroupSelect?: (groupId: number) => void;
  filteredGroupsCount: number;
}

export const FilterAndAnnotation: React.FC<FilterAndAnnotationProps> = ({
  groups,
  filterOptions,
  onFilterChange,
  onAnnotationChange,
  selectedGroup,
  onGroupSelect,
  filteredGroupsCount
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [annotationSurnames, setAnnotationSurnames] = useState('');
  const [annotationLocations, setAnnotationLocations] = useState('');
  const [annotationTags, setAnnotationTags] = useState('');

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    onFilterChange({
      ...filterOptions,
      [key]: value
    });
  };

  const handleAnnotationSave = (groupId: number) => {
    const annotation: GroupAnnotation = {
      notes: annotationText || undefined,
      surnames: annotationSurnames ? annotationSurnames.split(',').map(s => s.trim()) : undefined,
      locations: annotationLocations ? annotationLocations.split(',').map(l => l.trim()) : undefined,
      tags: annotationTags ? annotationTags.split(',').map(t => t.trim()) : undefined,
      researchStatus: 'pending',
      lastModified: new Date()
    };

    onAnnotationChange(groupId, annotation);
    setEditingGroup(null);
    setAnnotationText('');
    setAnnotationSurnames('');
    setAnnotationLocations('');
    setAnnotationTags('');
  };

  const startEditing = (group: TriangulationGroup) => {
    setEditingGroup(group.chromosome);
    setAnnotationText(group.annotations?.notes || '');
    setAnnotationSurnames(group.annotations?.surnames?.join(', ') || '');
    setAnnotationLocations(group.annotations?.locations?.join(', ') || '');
    setAnnotationTags(group.annotations?.tags?.join(', ') || '');
  };

  // Get unique chromosomes for filter
  const chromosomes = [...new Set(groups.map(g => g.chromosome))].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Filter className="w-5 h-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-800">Filters & Search</h3>
          </div>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {isFilterOpen ? 'Hide' : 'Show'} Filters
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by match name, surnames, or common ancestors..."
            value={filterOptions.searchTerm || ''}
            onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {isFilterOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Chromosome Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chromosome</label>
              <select
                value={filterOptions.chromosome || ''}
                onChange={(e) => handleFilterChange('chromosome', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {Array.from({ length: 23 }, (_, i) => i + 1).map(chr => (
                  <option key={chr} value={chr}>{chr}</option>
                ))}
              </select>
            </div>

            {/* Size Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Size (cM)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={filterOptions.minSize || ''}
                onChange={(e) => handleFilterChange('minSize', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Size (cM)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={filterOptions.maxSize || ''}
                onChange={(e) => handleFilterChange('maxSize', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="∞"
              />
            </div>

            {/* Match Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Matches</label>
              <input
                type="number"
                min="1"
                value={filterOptions.minMatches || ''}
                onChange={(e) => handleFilterChange('minMatches', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1"
              />
            </div>

            {/* Cousin Level Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cousin Level</label>
              <select
                value={filterOptions.cousinLevel || ''}
                onChange={(e) => handleFilterChange('cousinLevel', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="1st Cousin">1st Cousin</option>
                <option value="2nd Cousin">2nd Cousin</option>
                <option value="3rd Cousin">3rd Cousin</option>
                <option value="4th Cousin">4th Cousin</option>
                <option value="5th Cousin">5th Cousin</option>
                <option value="6th Cousin">6th Cousin</option>
                <option value="7th Cousin">7th Cousin</option>
                <option value="8th Cousin">8th Cousin</option>
              </select>
            </div>

            {/* Generation Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Generation</label>
              <select
                value={filterOptions.generation || ''}
                onChange={(e) => handleFilterChange('generation', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="1">1 (Parent/Child)</option>
                <option value="2">2 (Grandparent/Grandchild)</option>
                <option value="3">3 (Great-Grandparent)</option>
                <option value="4">4 (2nd Great-Grandparent)</option>
                <option value="5">5 (3rd Great-Grandparent)</option>
                <option value="6">6 (4th Great-Grandparent)</option>
                <option value="7">7 (5th Great-Grandparent)</option>
                <option value="8">8 (6th Great-Grandparent)</option>
              </select>
            </div>

            {/* Confidence Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Confidence (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={filterOptions.confidenceThreshold || ''}
                onChange={(e) => handleFilterChange('confidenceThreshold', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>

            {/* Max Matches */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Matches</label>
              <input
                type="number"
                min="1"
                value={filterOptions.maxMatches || ''}
                onChange={(e) => handleFilterChange('maxMatches', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="∞"
              />
            </div>
          </div>
        )}

        {/* Sort Controls */}
        <div className="flex items-center space-x-4 mt-4">
          <label className="text-sm font-medium text-gray-700">Sort by:</label>
          <select
            value={filterOptions.sortBy}
            onChange={(e) => handleFilterChange('sortBy', e.target.value as any)}
            className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="chromosome">Chromosome</option>
            <option value="averageSize">Size</option>
            <option value="matches">Matches</option>
            <option value="confidenceScore">Confidence</option>
            <option value="startPosition">Start Position</option>
            <option value="commonAncestors">Suggested Common Ancestor</option>
          </select>
          
          <button
            onClick={() => handleFilterChange('sortOrder', filterOptions.sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {filterOptions.sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredGroupsCount} of {groups.length} triangulation groups
      </div>

      {/* Annotation Editor */}
      {editingGroup !== null && (
        <div className="bg-white rounded-lg shadow-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-800">Edit Annotation</h4>
            <button
              onClick={() => setEditingGroup(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={annotationText}
                onChange={(e) => setAnnotationText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add research notes..."
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Surnames (comma-separated)</label>
                <input
                  type="text"
                  value={annotationSurnames}
                  onChange={(e) => setAnnotationSurnames(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Smith, Jones, Brown"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Locations (comma-separated)</label>
                <input
                  type="text"
                  value={annotationLocations}
                  onChange={(e) => setAnnotationLocations(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="England, Scotland, Ireland"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={annotationTags}
                onChange={(e) => setAnnotationTags(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="verified, brick-wall, colonial"
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setEditingGroup(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAnnotationSave(editingGroup)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <Save className="w-4 h-4 inline mr-1" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};