import React from 'react';
import { TreePine, X } from 'lucide-react';
import { GenealogicalTree } from '../types/triangulation';
import { LoadedTree, TreeOwners } from '../utils/timeSpace';

interface TreePanelProps {
  trees: LoadedTree[];
  mergedTree: GenealogicalTree | null;
  homeId?: string;
  owners: TreeOwners;
  /** Distinct match names from the uploaded CSVs, for linking a tree to a match */
  matchNames: string[];
  onUpload: (files: File[]) => void;
  onRemove: (fileName: string) => void;
  onHomeChange: (id: string) => void;
  onOwnerChange: (fileName: string, owner: string) => void;
}

const personLabel = (name: string, birthDate?: string) => (birthDate ? `${name} (b. ${birthDate})` : name);

export const TreePanel: React.FC<TreePanelProps> = ({
  trees,
  mergedTree,
  homeId,
  owners,
  matchNames,
  onUpload,
  onRemove,
  onHomeChange,
  onOwnerChange
}) => {
  const homeFile = trees[0]?.fileName;
  const homeCandidates = mergedTree?.individuals.filter(person => person.sourceFile === homeFile) ?? [];
  const home = homeCandidates.find(person => person.id === homeId);

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
        <TreePine className="w-4 h-4 mr-2" />
        Family Trees (GEDCOM)
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Upload your tree first, then any matches' trees. Their places are mapped against each group's genetic clock.
      </p>
      <input
        type="file"
        accept=".ged,.gedcom"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onUpload(files);
          e.target.value = '';
        }}
        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />

      {trees.length > 0 && (
        <div className="mt-3 space-y-2">
          {trees.map(({ fileName, tree }, index) => (
            <div key={fileName} className="p-2 bg-green-50 rounded-lg text-xs">
              <div className="flex items-center justify-between">
                <span className="text-green-700 truncate" title={fileName}>
                  ✓ {fileName}: {tree.individuals.length} people
                </span>
                <button onClick={() => onRemove(fileName)} className="text-gray-400 hover:text-red-600 ml-2" title="Remove this tree">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {index === 0 ? (
                <div className="text-gray-600 mt-1">Your tree</div>
              ) : (
                <label className="block mt-1 text-gray-600">
                  Whose tree?{' '}
                  <input
                    list="tree-owner-options"
                    value={owners[fileName] ?? ''}
                    onChange={(e) => onOwnerChange(fileName, e.target.value)}
                    placeholder="Match name (blank = use for all groups)"
                    className="w-full mt-1 px-2 py-1 border border-gray-300 rounded"
                  />
                </label>
              )}
            </div>
          ))}
          <datalist id="tree-owner-options">
            {matchNames.map(name => <option key={name} value={name} />)}
          </datalist>

          <label className="block text-xs text-gray-700 mt-3">
            You (home person) in your tree
            <select
              value={homeId ?? ''}
              onChange={(e) => onHomeChange(e.target.value)}
              className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-xs"
            >
              {homeCandidates.map(person => (
                <option key={person.id} value={person.id}>{personLabel(person.name, person.birthDate)}</option>
              ))}
            </select>
          </label>
          {home && !home.birthDate && (
            <p className="text-xs text-amber-700">
              Add a birth date for {home.name} in your tree to turn generations into years.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
