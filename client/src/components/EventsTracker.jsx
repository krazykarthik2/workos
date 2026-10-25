import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus, Paperclip, ChevronRight, ChevronDown, Edit3, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { EventService } from '../services';

export default function EventsTracker({ events, onRefresh, allFiles }) {
  const [title, setTitle] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Meeting');
  const [linkedFile, setLinkedFile] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await EventService.create({
        title: title.trim(),
        description: markdownContent.trim(),
        event_date: eventDate,
        category,
        linked_files: linkedFile ? [linkedFile] : []
      });
      setTitle('');
      setMarkdownContent('');
      setLinkedFile('');
      setIsAdding(false);
      setPreviewMode(false);
      onRefresh();
    } catch {
      toast.error('Failed to save event');
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Create / Write Event in Markdown */}
      {isAdding ? (
        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '16px',
          border: '1px solid var(--border-light)',
          borderRadius: '6px',
          background: 'var(--card-bg)'
        }}>
          {/* Metadata Top Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
            <input
              type="text"
              placeholder="Event / Meeting Title..."
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: '8px 10px', background: 'transparent', fontWeight: '500' }}
            />
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{ padding: '8px 10px', background: 'transparent' }}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ padding: '8px 10px', background: 'transparent' }}
            >
              <option value="Meeting">Meeting</option>
              <option value="Milestone">Milestone</option>
              <option value="Conference">Conference</option>
              <option value="Strategy">Strategy Session</option>
            </select>
          </div>

          {/* Markdown Toolbar Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '12px',
                  color: !previewMode ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: !previewMode ? 'var(--bg-hover)' : 'transparent',
                  fontWeight: !previewMode ? '500' : '400'
                }}
              >
                <Edit3 size={13} /> Write (Markdown)
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '12px',
                  color: previewMode ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: previewMode ? 'var(--bg-hover)' : 'transparent',
                  fontWeight: previewMode ? '500' : '400'
                }}
              >
                <Eye size={13} /> Preview
              </button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Supports Notion-style headings, checkboxes `- [ ]`, bullets, and tables
            </span>
          </div>

          {/* Editor or Markdown Preview */}
          {!previewMode ? (
            <textarea
              placeholder={`## Agenda\n- Discuss Q4 objectives\n- Review partner integrations\n\n### Key Decisions\n1. Target date locked for Nov 15\n2. Sarah to lead deployment\n\n- [ ] Send summary deck to executive team`}
              value={markdownContent}
              onChange={(e) => setMarkdownContent(e.target.value)}
              rows={9}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                lineHeight: '1.6',
                fontFamily: 'inherit',
                fontSize: '13.5px',
                resize: 'vertical'
              }}
            />
          ) : (
            <div style={{
              minHeight: '180px',
              padding: '12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              borderRadius: '4px',
              overflowY: 'auto'
            }}>
              {markdownContent.trim() ? (
                <div className="notion-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdownContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing to preview.</span>
              )}
            </div>
          )}

          {/* Bottom Bar: Attachments & Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
            <select
              value={linkedFile}
              onChange={(e) => setLinkedFile(e.target.value)}
              style={{ padding: '6px 8px', maxWidth: '200px', background: 'transparent', fontSize: '12.5px' }}
            >
              <option value="">Attach document / photo...</option>
              {allFiles.map(f => (
                <option key={f.id} value={f.file_path}>{f.original_filename}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                style={{ color: 'var(--text-secondary)', padding: '6px 12px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  fontWeight: '500',
                  padding: '6px 16px',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}
              >
                Publish Event
              </button>
            </div>
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
              borderRadius: '4px',
              fontSize: '13px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Plus size={15} /> <span>Write Event (Markdown)</span>
          </button>
        </div>
      )}

      {/* Notion List of Events with Expandable Markdown Doc */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
        {events.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13px' }}>
            No events logged yet. Click 'Write Event' to write minutes or milestone briefs in Markdown.
          </div>
        ) : (
          events.map(ev => {
            const isExpanded = expandedId === ev.id;
            return (
              <div
                key={ev.id}
                style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  background: 'var(--card-bg)',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s ease'
                }}
              >
                {/* Event Row Header */}
                <div
                  onClick={() => toggleExpand(ev.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-active)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontWeight: '500'
                    }}>
                      {ev.category}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '13.5px' }}>
                      {ev.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>{dayjs(ev.event_date).format('MMM D, YYYY')}</span>
                    {ev.linked_files && ev.linked_files.length > 0 && (
                      <a
                        href={`http://localhost:8000${ev.linked_files[0]}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Paperclip size={13} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Expanded Rich Markdown Content */}
                {isExpanded && (
                  <div style={{
                    padding: '14px 18px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'var(--bg-secondary)',
                    fontSize: '13.5px',
                    lineHeight: '1.6'
                  }}>
                    {ev.description ? (
                      <div className="notion-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {ev.description}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12.5px', fontStyle: 'italic' }}>
                        No details recorded for this event.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Notion-style Markdown Rendering Styles */}
      <style>{`
        .notion-markdown h1 { font-size: 1.3rem; font-weight: 600; margin: 12px 0 6px 0; color: var(--text-primary); }
        .notion-markdown h2 { font-size: 1.15rem; font-weight: 600; margin: 10px 0 4px 0; color: var(--text-primary); }
        .notion-markdown h3 { font-size: 1.0rem; font-weight: 600; margin: 8px 0 4px 0; color: var(--text-primary); }
        .notion-markdown p { margin-bottom: 8px; color: var(--text-primary); }
        .notion-markdown ul, .notion-markdown ol { padding-left: 20px; margin-bottom: 8px; color: var(--text-primary); }
        .notion-markdown li { margin-bottom: 3px; }
        .notion-markdown blockquote { border-left: 3px solid var(--border-strong); padding-left: 10px; color: var(--text-secondary); margin: 8px 0; }
        .notion-markdown code { background: var(--bg-hover); padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 12px; }
        .notion-markdown table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .notion-markdown th, .notion-markdown td { border: 1px solid var(--border-light); padding: 6px 10px; font-size: 12.5px; }
        .notion-markdown th { background: var(--bg-hover); font-weight: 500; }
      `}</style>
    </div>
  );
}
