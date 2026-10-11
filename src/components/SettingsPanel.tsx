import React from 'react';
import { Settings, Sliders, Eye, FileText } from 'lucide-react';
import { TriangulationSettings } from '../types/triangulation';

interface SettingsPanelProps {
  settings: TriangulationSettings;
  onSettingsChange: (settings: TriangulationSettings) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  isOpen,
  onToggle
}) => {
  const handleChange = <K extends keyof TriangulationSettings>(key: K, value: TriangulationSettings[K]) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center">
          <Settings className="w-5 h-5 text-gray-600 mr-2" />
          <span className="font-medium text-gray-800">Analysis Settings</span>
        </div>
        <div className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-6">
          {/* Triangulation Thresholds */}
          <div>
            <h4 className="flex items-center text-sm font-medium text-gray-700 mb-3">
              <Sliders className="w-4 h-4 mr-2" />
              Triangulation Thresholds
            </h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Minimum Segment Size: {settings.minimumSize} cM
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={settings.minimumSize}
                  onChange={(e) => handleChange('minimumSize', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1 cM</span>
                  <span>20 cM</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Minimum Matches: {settings.minimumMatches}
                </label>
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={settings.minimumMatches}
                  onChange={(e) => handleChange('minimumMatches', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>2</span>
                  <span>10</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Boundary Matching
                </label>
                <select
                  value={settings.boundaryToleranceBp}
                  onChange={(e) => handleChange('boundaryToleranceBp', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={0}>Exact start and end positions</option>
                  <option value={100000}>Within 100 kb</option>
                  <option value={250000}>Within 250 kb</option>
                  <option value={500000}>Within 500 kb</option>
                  <option value={1000000}>Within 1 Mb</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  For exact-boundary triangulation. Use exact for files from one company; allow a little slack when
                  combining companies, whose chips end segments at slightly different positions.
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Minimum Shared Stretch: {settings.minimumOverlapCM} cM
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={settings.minimumOverlapCM}
                  onChange={(e) => handleChange('minimumOverlapCM', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>5 cM</span>
                  <span>30 cM</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Every match in a group must share at least this much DNA with you on the same stretch. 7 cM is the usual minimum; 15+ cM is very reliable.
                </p>
              </div>
            </div>
          </div>

          {/* Feature Toggles */}
          <div>
            <h4 className="flex items-center text-sm font-medium text-gray-700 mb-3">
              <Eye className="w-4 h-4 mr-2" />
              Analysis Features
            </h4>
            
            <div className="space-y-3">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableRelationshipPrediction}
                  onChange={(e) => handleChange('enableRelationshipPrediction', e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center ${
                  settings.enableRelationshipPrediction 
                    ? 'bg-blue-600 border-blue-600' 
                    : 'border-gray-300'
                }`}>
                  {settings.enableRelationshipPrediction && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700">Relationship Prediction</span>
              </label>

              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableCrossVerification}
                  onChange={(e) => handleChange('enableCrossVerification', e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center ${
                  settings.enableCrossVerification 
                    ? 'bg-blue-600 border-blue-600' 
                    : 'border-gray-300'
                }`}>
                  {settings.enableCrossVerification && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700">Cross-Verification with Family Trees</span>
              </label>

              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.separateByLineage}
                  onChange={(e) => handleChange('separateByLineage', e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 mr-3 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                  settings.separateByLineage 
                    ? 'bg-blue-600 border-blue-600' 
                    : 'border-gray-300'
                }`}>
                  {settings.separateByLineage && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700">
                  Separate Groups by Lineage
                  <span className="block text-xs text-gray-500">
                    Never group matches tagged to different branches (e.g. Dad's dad vs. Dad's mom)
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Performance Settings */}
          <div>
            <h4 className="flex items-center text-sm font-medium text-gray-700 mb-3">
              <FileText className="w-4 h-4 mr-2" />
              Performance
            </h4>
            
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Results per Page: {settings.maxResultsPerPage}
              </label>
              <select
                value={settings.maxResultsPerPage}
                onChange={(e) => handleChange('maxResultsPerPage', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Reset Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                const defaultSettings: TriangulationSettings = {
                  minimumSize: 7,
                  minimumMatches: 3,
                  minimumOverlapCM: 7,
                  boundaryToleranceBp: 0,
                  enableRelationshipPrediction: true,
                  enableCrossVerification: false,
                  separateByLineage: true,
                  maxResultsPerPage: 25
                };
                onSettingsChange(defaultSettings);
              }}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 