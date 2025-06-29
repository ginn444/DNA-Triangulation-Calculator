import React, { useState, useCallback } from 'react';
import { Upload, FileText, Search, Download, AlertCircle, CheckCircle2, Settings, TreePine } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { TriangulationResults } from './TriangulationResults';
import { SettingsPanel } from './SettingsPanel';
import { FilterAndAnnotation } from './FilterAndAnnotation';
import { ChromosomeBrowser } from './ChromosomeBrowser';
import { processTriangulation } from '../utils/triangulationEngine';
import { 
  TriangulationGroup, 
  ProcessingStatus, 
  TriangulationSettings, 
  FilterOptions,
  GroupAnnotation,
  GenealogicalTree
} from '../types/triangulation';
import { parseGEDCOM } from '../utils/gedcomParser';

const DEFAULT_SETTINGS: TriangulationSettings = {
  minimumSize: 7,
  minimumMatches: 3,
  overlapThreshold: 0.5,
  enableRelationshipPrediction: true,
  enableConfidenceScoring: true,
  enableCrossVerification: false,
  maxResultsPerPage: 25
};

const DEFAULT_FILTERS: FilterOptions = {
  sortBy: 'chromosome',
  sortOrder: 'asc'
};

export const TriangulationCalculator: React.FC = () => {
  const [triangulationGroups, setTriangulationGroups] = useState<TriangulationGroup[]>([]);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [processingMessage, setProcessingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<TriangulationSettings>(DEFAULT_SETTINGS);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>();
  const [genealogicalTree, setGenealogicalTree] = useState<GenealogicalTree | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  const handleFilesUploaded = useCallback(async (files: File[]) => {
    setUploadedFiles(files);
    setError(null);
    setTriangulationGroups([]);
    setProcessingStatus('idle');
    setCurrentPage(1);
    
    // Try to read headers from the first file to show users what was found
    if (files.length > 0) {
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          const firstLine = text.split('\n')[0];
          if (firstLine) {
            const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));
            setCsvHeaders(headers);
            console.log('Headers found in CSV:', headers);
          }
        };
        reader.readAsText(files[0]);
      } catch (error) {
        console.warn('Could not read CSV headers for preview:', error);
      }
    }
  }, []);

  const handleProcessFiles = useCallback(async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload at least one CSV file to process.');
      return;
    }

    setProcessingStatus('processing');
    setProcessingMessage('Reading uploaded files...');
    setError(null);

    try {
      const results = await processTriangulation(
        uploadedFiles, 
        settings,
        (message) => setProcessingMessage(message),
        genealogicalTree // Pass the genealogical tree
      );
      
      setTriangulationGroups(results);
      setProcessingStatus('completed');
      setProcessingMessage(`Found ${results.length} triangulation groups`);
      setCurrentPage(1);
      
      // Clear uploaded files from memory after processing
      setUploadedFiles([]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during processing';
      
      // Provide more helpful error messages for common issues
      if (errorMessage.includes('Could not identify required columns')) {
        setError(`CSV Header Recognition Issue: ${errorMessage}

Expected headers include:
• Chromosome (or Chr)
• Start Location (or Start Position)
• End Location (or End Position)  
• Overlap cM (or Shared DNA, Longest Block)

Please ensure your CSV files contain these column headers.`);
      } else if (errorMessage.includes('No valid DNA segment data found')) {
        setError(`No Valid Data Found: ${errorMessage}

Please check that your CSV files contain:
• Valid chromosome numbers (1-23)
• Valid position numbers (positive integers)
• Valid cM values (at least ${settings.minimumSize} cM)
• Proper data formatting`);
      } else {
        setError(errorMessage);
      }
      
      setProcessingStatus('error');
      setProcessingMessage('');
    }
  }, [uploadedFiles, settings, genealogicalTree]);

  const handleReset = useCallback(() => {
    setUploadedFiles([]);
    setTriangulationGroups([]);
    setProcessingStatus('idle');
    setProcessingMessage('');
    setError(null);
    setSelectedGroup(undefined);
    setGenealogicalTree(null);
    setCurrentPage(1);
  }, []);

  const handleDownloadResults = useCallback(() => {
    if (triangulationGroups.length === 0) return;

    const csvContent = [
      'Group ID,Match Name,Chromosome,Start Position,End Position,Size (cM),Matching SNPs,Y-Haplogroup,mtDNA-Haplogroup,Total Matches,Confidence Score,Relationship Prediction,Notes,Surnames,Locations,Tags,Tree Matches,Common Ancestors',
      ...triangulationGroups.flatMap((group, groupIndex) =>
        group.matches.map(match =>
          `${groupIndex + 1},"${match.matchName}",${match.chromosome},${match.startPosition},${match.endPosition},${match.sizeCM.toFixed(2)},${match.matchingSNPs || 'N/A'},"${match.yHaplogroup || 'N/A'}","${match.mtHaplogroup || 'N/A'}",${group.matches.length},${group.confidenceScore || 'N/A'},"${group.relationshipPrediction?.relationship || 'N/A'}","${group.annotations?.notes || match.notes || ''}","${group.annotations?.surnames?.join('; ') || match.ancestralSurnames?.join('; ') || ''}","${group.annotations?.locations?.join('; ') || match.locations?.join('; ') || ''}","${group.annotations?.tags?.join('; ') || ''}","${group.treeMatches?.map(tm => tm.treeIndividuals.join(', ')).join('; ') || ''}","${group.commonAncestors?.join('; ') || ''}"`
        )
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `triangulation_results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [triangulationGroups]);

  const handleAnnotationChange = useCallback((groupId: number, annotation: GroupAnnotation) => {
    setTriangulationGroups(prev => 
      prev.map((group, index) => 
        index === groupId 
          ? { ...group, annotations: annotation }
          : group
      )
    );
  }, []);

  const handleTreeUpload = useCallback(async (file: File) => {
    try {
      const tree = await parseGEDCOM(file);
      setGenealogicalTree(tree);
      setProcessingMessage(`Loaded genealogical tree with ${tree.individuals.length} individuals`);
    } catch (error) {
      setError('Failed to parse GEDCOM file. Please ensure it\'s a valid GEDCOM format.');
    }
  }, []);

  // Pagination
  const itemsPerPage = settings.maxResultsPerPage;
  const totalPages = Math.ceil(triangulationGroups.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentGroups = triangulationGroups.slice(startIndex, endIndex);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="text-center mb-12">
        <div className="flex justify-center items-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg">
            <Search className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          DNA Triangulation Calculator
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Upload your chromosome browser CSV files to identify triangulated DNA segments. 
          Triangulation helps confirm that shared DNA comes from common ancestors by finding 
          overlapping segments between multiple matches.
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-8">
        {/* Left Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Upload Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mr-3">
                <Upload className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">Upload Files</h2>
            </div>
            
            <FileUpload onFilesUploaded={handleFilesUploaded} />
            
            {uploadedFiles.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files:</h3>
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center p-3 bg-blue-50 rounded-lg">
                      <FileText className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate" title={file.name}>
                        {file.name}
                      </span>
                    </div>
                  ))}
                </div>
                
                {/* Show CSV headers if available */}
                {csvHeaders.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-medium text-gray-600 mb-2">CSV Headers Detected:</h4>
                    <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border max-h-20 overflow-y-auto">
                      {csvHeaders.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GEDCOM Upload */}
            {settings.enableCrossVerification && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <TreePine className="w-4 h-4 mr-2" />
                  Family Tree (GEDCOM)
                </h3>
                <input
                  type="file"
                  accept=".ged,.gedcom"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleTreeUpload(file);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {genealogicalTree && (
                  <div className="mt-2 text-xs text-green-600">
                    ✓ Loaded {genealogicalTree.individuals.length} individuals
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 space-y-3">
              <button
                onClick={handleProcessFiles}
                disabled={uploadedFiles.length === 0 || processingStatus === 'processing'}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl font-medium 
                         hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 
                         disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed
                         shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {processingStatus === 'processing' ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  'Calculate Triangulations'
                )}
              </button>

              {triangulationGroups.length > 0 && (
                <button
                  onClick={handleDownloadResults}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-xl font-medium 
                           hover:bg-green-700 transition-all duration-200
                           shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <Download className="w-4 h-4 inline mr-2" />
                  Download Results
                </button>
              )}

              <button
                onClick={handleReset}
                className="w-full bg-gray-500 text-white py-3 px-4 rounded-xl font-medium 
                         hover:bg-gray-600 transition-all duration-200
                         shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Reset Calculator
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
            isOpen={isSettingsOpen}
            onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
          />

          {/* Processing Status */}
          {(processingStatus !== 'idle' || error) && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Status</h3>
              
              {error && (
                <div className="flex items-start p-4 bg-red-50 rounded-xl border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-red-800">Error</h4>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {processingStatus === 'processing' && (
                <div className="flex items-start p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent mr-3 mt-0.5"></div>
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">Processing</h4>
                    <p className="text-sm text-blue-700 mt-1">{processingMessage}</p>
                  </div>
                </div>
              )}

              {processingStatus === 'completed' && (
                <div className="flex items-start p-4 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-green-800">Completed</h4>
                    <p className="text-sm text-green-700 mt-1">{processingMessage}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Filter and Annotation */}
          {triangulationGroups.length > 0 && (
            <FilterAndAnnotation
              groups={triangulationGroups}
              filterOptions={filterOptions}
              onFilterChange={setFilterOptions}
              onAnnotationChange={handleAnnotationChange}
              selectedGroup={selectedGroup}
              onGroupSelect={setSelectedGroup}
            />
          )}

          {/* Chromosome Browser */}
          {triangulationGroups.length > 0 && (
            <ChromosomeBrowser
              groups={triangulationGroups}
              selectedGroup={selectedGroup}
              onGroupSelect={setSelectedGroup}
            />
          )}

          {/* Results */}
          {triangulationGroups.length > 0 && (
            <TriangulationResults 
              groups={currentGroups}
              onAnnotationChange={handleAnnotationChange}
              selectedGroup={selectedGroup}
              onGroupSelect={setSelectedGroup}
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};