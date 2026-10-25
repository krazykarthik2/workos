import React, { useState } from 'react';
import { Plus, Check, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { WorkDoneService } from '../services';

export default function WorkDoneTracker({ workList, onRefresh, allFiles, currentUser }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [completedBy, setCompletedBy] = useState(currentUser?.display_name || currentUser?.email?.split('@')[0] || '');
  const [linkedFile, setLinkedFile] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await WorkDoneService.create({
        title,
        notes,
        completed_by: completedBy || currentUser?.display_name || currentUser?.email?.split('@')[0] || 'Me',
        user_email: currentUser?.email || '',
        linked_files: linkedFile ? [linkedFile] : []
      });
      setTitle('');
      setNotes('');
      setLinkedFile('');
      setIsAdding(false);
      onRefresh();
      toast.success('Deliverable logged!');
    } catch {
      toast.error('Failed to log completed work');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {isAdding ? (
        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          border: '1px solid var(--border-light)',
          borderRadius: '4px',
          background: 'var(--card-bg)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
            <input
              type="text"
              placeholder="Milestone or task completed..."
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: '6px 10px', background: 'transparent' }}
            />
            <input
              type="text"
              placeholder="Done by"
              value={completedBy}
              onChange={(e) => setCompletedBy(e.target.value)}
              style={{ padding: '6px 10px', background: 'transparent' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto auto', gap: '8px' }}>
            <input
              type="text"
              placeholder="Output notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ padding: '6px 10px', background: 'transparent' }}
            />
            <select
              value={linkedFile}
              onChange={(e) => setLinkedFile(e.target.value)}
              style={{ padding: '6px 8px', background: 'transparent' }}
            >
              <option value="">Attach proof...</option>
              {allFiles.map(f => (
                <option key={f.id} value={f.file_path}>{f.original_filename}</option>
              ))}
            </select>
            <button
              type="submit"
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                fontWeight: '500',
                padding: '6px 14px',
                borderRadius: '4px'
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              style={{ color: 'var(--text-secondary)', padding: '6px 10px' }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={() => setIsAdding(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-secondary)',
              padding: '6px 10px',
              borderRadius: '4px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Plus size={16} /> <span>New Log</span>
          </button>
        </div>
      )}

      {/* Notion Clean Row View */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
        {workList.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13px' }}>
            No work logs recorded yet.
          </div>
        ) : (
          workList.map(item => (
            <div key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border-light)',
              borderRadius: '4px',
              fontSize: '13.5px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Check size={14} color="var(--text-secondary)" />
                <span style={{ color: 'var(--text-primary)', fontWeight: '400' }}>{item.title}</span>
                {item.notes && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>— {item.notes}</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{item.completed_by}</span>
                <span>{dayjs(item.completed_at).format('MMM D, h:mm A')}</span>
                {item.linked_files && item.linked_files.length > 0 && (
                  <a href={`http://localhost:8000${item.linked_files[0]}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)' }}>
                    <Paperclip size={13} />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
