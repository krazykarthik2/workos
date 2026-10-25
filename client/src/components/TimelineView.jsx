import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { TimelineService } from '../services';

export default function TimelineView({ timeline, onRevertSuccess }) {
  const [revertingId, setRevertingId] = useState(null);

  const handleRevert = async (id) => {
    setRevertingId(id);
    try {
      await TimelineService.revert(id);
      toast.success('Reverted');
      onRevertSuccess();
    } catch {
      toast.error('Revert failed');
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
        <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
          Universal Audit History
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Every action is immutable and reversible
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1 }}>
        {timeline.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13px' }}>
            Timeline empty.
          </div>
        ) : (
          timeline.map(entry => (
            <div key={entry.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '13px',
              opacity: entry.is_reverted ? 0.4 : 1
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}>
                  {entry.action}
                </span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {entry.description || `${entry.action} on ${entry.entity_type}`}
                </span>
                {entry.is_reverted && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(reverted)</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  {dayjs(entry.timestamp).format('h:mm:ss A')}
                </span>
                {!entry.is_reverted && entry.action !== 'revert' && (
                  <button
                    onClick={() => handleRevert(entry.id)}
                    disabled={revertingId === entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11.5px',
                      color: 'var(--text-secondary)',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    title="Undo this change"
                  >
                    <RotateCcw size={12} /> {revertingId === entry.id ? 'Reverting...' : 'Revert'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
