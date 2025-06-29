import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, AlertCircle, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  onFilesUploaded: (files: File[]) => void;
}

const MAX_FILE_SIZE = Infinity; // or a really high value if needed
const MAX_FILES = 10; // Maximum number of files

export const FileUpload: React.FC<FileUploadProps> = ({ onFilesUploaded }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    // Remove file type restrictions - allow any file type
    // The CSV parser will handle header detection and mapping

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return { 
        valid: false, 
        error: `${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      };
    }

    // Check if file is empty
    if (file.size === 0) {
      return { valid: false, error: `${file.name} is empty` };
    }

    return { valid: true };
  }, []);

  const processFiles = useCallback((files: File[]) => {
    console.log('Processing files:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
    
    setUploadError(null);
    const validFiles: File[] = [];
    const errors: string[] = [];

    // Check total number of files
    if (files.length > MAX_FILES) {
      const errorMsg = `Too many files selected. Maximum allowed is ${MAX_FILES} files.`;
      console.warn(errorMsg);
      setUploadError(errorMsg);
      return;
    }

    // Validate each file
    files.forEach(file => {
      console.log('Validating file:', file.name, 'Size:', file.size, 'Type:', file.type);
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
        console.log('File validated successfully:', file.name);
      } else {
        console.warn('File validation failed:', file.name, validation.error);
        errors.push(validation.error!);
      }
    });

    // Show errors if any
    if (errors.length > 0) {
      const errorMsg = `Upload errors:\n${errors.join('\n')}`;
      console.error('Upload errors:', errorMsg);
      setUploadError(errorMsg);
    }

    // Update files if we have valid ones
    if (validFiles.length > 0) {
      console.log('Setting valid files:', validFiles.map(f => f.name));
      setSelectedFiles(validFiles);
      onFilesUploaded(validFiles);
    } else {
      console.warn('No valid files to process');
    }
  }, [validateFile, onFilesUploaded]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File input change event triggered');
    console.log('Files in input:', e.target.files);
    
    const files = Array.from(e.target.files || []);
    console.log('Files array:', files);
    
    if (files.length === 0) {
      console.warn('No files selected in input');
      return;
    }
    
    processFiles(files);
    
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [processFiles]);

  const handleClick = useCallback(() => {
    console.log('Upload area clicked, triggering file input');
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    } else {
      console.error('File input element not found');
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesUploaded(newFiles);
    setUploadError(null);
  }, [selectedFiles, onFilesUploaded]);

  const clearError = useCallback(() => {
    setUploadError(null);
  }, []);

  return (
    <div className="space-y-4">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
          ${dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          id="file-upload"
          type="file"
          multiple
          accept="*/*"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ fontSize: '0px' }}
        />
        
        <div className="flex flex-col items-center space-y-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200
            ${dragActive ? 'bg-blue-200' : 'bg-gray-100'}`}>
            <Upload className={`w-6 h-6 ${dragActive ? 'text-blue-600' : 'text-gray-500'}`} />
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-700">
              Drop files here, or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Supports up to {MAX_FILES} files, max {MAX_FILE_SIZE / 1024 / 1024}MB each
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Flexible CSV parser will detect headers automatically
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {uploadError && (
        <div className="flex items-start p-4 bg-red-50 rounded-xl border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800">Upload Error</h4>
            <p className="text-sm text-red-700 mt-1 whitespace-pre-line">{uploadError}</p>
          </div>
          <button
            onClick={clearError}
            className="p-1 hover:bg-red-100 rounded-full transition-colors duration-200"
          >
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {/* Success Message */}
      {selectedFiles.length > 0 && !uploadError && (
        <div className="flex items-start p-4 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-green-800">Files Ready</h4>
            <p className="text-sm text-green-700 mt-1">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected for processing
            </p>
          </div>
        </div>
      )}

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Selected Files:</h4>
          {selectedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center flex-1 min-w-0">
                <FileText className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-700 truncate block">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors duration-200 ml-2"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
