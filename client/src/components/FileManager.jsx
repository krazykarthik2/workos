import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Search, FileText, Image as ImageIcon, Volume2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { FileService, ChatService } from '../services';

export default function FileManager({ files, onUploadSuccess, onSearch }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [playingTts, setPlayingTts] = useState(null);

  const onDrop = async (acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    setUploading(true);
    const toastId = toast.loading(`Indexing ${file.name}...`);
    try {
      await FileService.upload(file);
      toast.success('Indexed', { id: toastId });
      onUploadSuccess();
    } catch {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const handlePlaySummaryTTS = async (text, fileId) => {
    setPlayingTts(fileId);
    try {
      const data = await ChatService.tts(text);
      if (data.audio_url) {
        const audio = new Audio(`http://localhost:8000${data.audio_url}`);
        audio.play();
        audio.onended = () => setPlayingTts(null);
      } else {
        setPlayingTts(null);
      }
    } catch {
      setPlayingTts(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Top Search & Upload Controls */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '6px', flex: 1, maxWidth: '480px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                background: 'transparent'
              }}
            />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); onSearch(''); }}
              style={{ color: 'var(--text-secondary)', padding: '4px 8px' }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Notion Drop Zone */}
      <div
        {...getRootProps()}
        style={{
          border: '1px dashed var(--border-strong)',
          borderRadius: '4px',
          background: isDragActive ? 'var(--bg-hover)' : 'transparent',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          transition: 'background 0.12s ease'
        }}
      >
        <input {...getInputProps()} />
        <Upload size={18} color="var(--text-secondary)" />
        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          {isDragActive ? 'Drop file to index' : 'Click or drop PDF / image to index'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Extracts OCR • FAISS vector indexing
        </span>
      </div>

      {/* Notion Table / Gallery View */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '12px',
        overflowY: 'auto',
        flex: 1
      }}>
        {files.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13px' }}>
            No indexed files yet.
          </div>
        ) : (
          files.map(f => {
            const isImage = f.mime_type?.startsWith('image') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(f.original_filename);
            return (
              <div key={f.id} style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    {isImage ? <ImageIcon size={16} color="var(--text-secondary)" /> : <FileText size={16} color="var(--text-secondary)" />}
                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.original_filename}
                    </span>
                  </div>
                  <a href={`http://localhost:8000${f.file_path}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>
                    <ExternalLink size={13} />
                  </a>
                </div>

                <div style={{
                  background: 'var(--bg-secondary)',
                  padding: '8px',
                  borderRadius: '3px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.4'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>Summary</span>
                    <button onClick={() => handlePlaySummaryTTS(f.summary, f.id)} style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Volume2 size={11} /> {playingTts === f.id ? 'Playing' : 'Listen'}
                    </button>
                  </div>
                  {f.summary || 'Summary unavailable'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: 'auto', alignItems: 'center' }}>
                  <span>{dayjs(f.uploaded_at).format('MMM D')}</span>
                  {f.linked_entity ? (
                    <span style={{ 
                      fontSize: '10px', 
                      background: 'var(--bg-hover)', 
                      padding: '1px 6px', 
                      borderRadius: '3px',
                      color: 'var(--text-primary)'
                    }}>
                      Linked to {f.linked_entity.type}
                    </span>
                  ) : (
                    <span>Indexed</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
