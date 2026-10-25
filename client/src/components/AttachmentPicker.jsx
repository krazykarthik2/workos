import React, { useState, useRef } from 'react';
import { Paperclip, UploadCloud, Link as LinkIcon, X, Check, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { FileService } from '../services';

export default function AttachmentPicker({ 
  allFiles = [], 
  selectedFiles = [], 
  onFilesChange, 
  entityType = null, 
  entityId = null,
  onFileUploaded = null 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'existing'
  const [uploading, setUploading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      toast('Processing OCR & Vector Indexing...', { icon: '⚙️' });
      const uploadedDoc = await FileService.upload(file, entityType, entityId);
      
      const newPath = uploadedDoc.file_path;
      if (!selectedFiles.includes(newPath)) {
        onFilesChange([...selectedFiles, newPath]);
      }
      
      toast.success(`Uploaded & linked "${file.name}"!`);
      if (onFileUploaded) onFileUploaded(uploadedDoc);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelectExisting = (filePath) => {
    if (selectedFiles.includes(filePath)) {
      onFilesChange(selectedFiles.filter(p => p !== filePath));
    } else {
      onFilesChange([...selectedFiles, filePath]);
    }
  };

  const removeSelected = (filePath) => {
    onFilesChange(selectedFiles.filter(p => p !== filePath));
  };

  const filteredExisting = allFiles.filter(f => 
    (f.original_filename || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="relative inline-block">
      {/* Trigger & Selected Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-[#ddd] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#252525] text-[#444] dark:text-[#ccc] transition-colors"
        >
          <Paperclip size={13} />
          <span>{selectedFiles.length > 0 ? `Attached (${selectedFiles.length})` : 'Attach / Link File'}</span>
        </button>

        {selectedFiles.map((path) => {
          const matched = allFiles.find(f => f.file_path === path);
          const displayName = matched?.original_filename || path.split('/').pop();
          return (
            <span
              key={path}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-[#f0f0f0] dark:bg-[#252525] text-[#333] dark:text-[#ddd] border border-[#e0e0e0] dark:border-[#333]"
            >
              <FileText size={11} className="text-[#888]" />
              <span className="max-w-[120px] truncate" title={displayName}>{displayName}</span>
              <button
                type="button"
                onClick={() => removeSelected(path)}
                className="text-[#888] hover:text-[#222] dark:hover:text-[#fff]"
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
      </div>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 w-72 bg-white dark:bg-[#1a1a1a] border border-[#e5e5e5] dark:border-[#2e2e2e] rounded-lg shadow-xl p-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-[#eee] dark:border-[#282828] mb-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`text-xs font-medium pb-1 transition-colors border-b-2 ${
                  activeTab === 'upload' 
                    ? 'border-black dark:border-white text-black dark:text-white' 
                    : 'border-transparent text-[#888] hover:text-[#333] dark:hover:text-[#ccc]'
                }`}
              >
                Upload New
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('existing')}
                className={`text-xs font-medium pb-1 transition-colors border-b-2 ${
                  activeTab === 'existing' 
                    ? 'border-black dark:border-white text-black dark:text-white' 
                    : 'border-transparent text-[#888] hover:text-[#333] dark:hover:text-[#ccc]'
                }`}
              >
                Link Existing ({allFiles.length})
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[#888] hover:text-[#222] dark:hover:text-[#fff]"
            >
              <X size={13} />
            </button>
          </div>

          {/* TAB 1: UPLOAD NEW FILE (OCR & FAISS PIPELINE) */}
          {activeTab === 'upload' && (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                id="attachment-file-upload"
                onChange={handleFileUpload}
                accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv"
              />
              <label
                htmlFor="attachment-file-upload"
                className={`flex flex-col items-center justify-center p-4 border border-dashed border-[#ccc] dark:border-[#444] rounded-lg cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#202020] transition-colors text-center ${
                  uploading ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <UploadCloud size={20} className="text-[#666] dark:text-[#999] mb-1" />
                <span className="text-xs font-medium text-[#222] dark:text-[#eee]">
                  {uploading ? 'Processing & OCR Indexing...' : 'Click to Upload Doc / Photo'}
                </span>
                <span className="text-[10px] text-[#888] mt-0.5">
                  PDFs, Images (OCR), Text files
                </span>
              </label>
              <p className="text-[10px] text-[#777] dark:text-[#888] leading-tight">
                Automatically indexes into the local FAISS vector search & creates a bi-directional link.
              </p>
            </div>
          )}

          {/* TAB 2: LINK EXISTING REPOSITORY FILE */}
          {activeTab === 'existing' && (
            <div className="space-y-2">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search indexed files..."
                className="w-full px-2.5 py-1 text-xs rounded border border-[#ddd] dark:border-[#333] bg-transparent text-[#222] dark:text-[#eee] focus:outline-none"
              />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredExisting.length === 0 ? (
                  <div className="text-center py-4 text-xs text-[#888]">No files found.</div>
                ) : (
                  filteredExisting.map((file) => {
                    const isSelected = selectedFiles.includes(file.file_path);
                    return (
                      <div
                        key={file.id}
                        onClick={() => toggleSelectExisting(file.file_path)}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer text-xs transition-colors ${
                          isSelected 
                            ? 'bg-black text-white dark:bg-white dark:text-black font-medium' 
                            : 'hover:bg-[#f2f2f2] dark:hover:bg-[#252525] text-[#333] dark:text-[#ccc]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <FileText size={12} className={isSelected ? 'text-white dark:text-black' : 'text-[#888]'} />
                          <span className="truncate">{file.original_filename}</span>
                        </div>
                        {isSelected && <Check size={12} />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
