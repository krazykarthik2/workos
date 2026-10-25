import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash2, Paperclip, MoreHorizontal, CheckSquare, Circle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { TaskService } from '../services';
import AttachmentPicker from './AttachmentPicker';

const COLUMNS = [
  { id: 'todo', title: 'To-do', icon: <Circle size={14} /> },
  { id: 'doing', title: 'In progress', icon: <Clock size={14} /> },
  { id: 'done', title: 'Done', icon: <CheckSquare size={14} /> }
];

export default function KanbanBoard({ tasks, onRefresh, allFiles }) {
  const [newTitle, setNewTitle] = useState('');
  const [selectedColumn, setSelectedColumn] = useState('todo');
  const [assignee, setAssignee] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isAdding, setIsAdding] = useState(false);

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    try {
      await TaskService.update(draggableId, { status: destination.droppableId });
      onRefresh();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await TaskService.create({
        title: newTitle.trim(),
        status: selectedColumn,
        assignee: assignee || 'Unassigned',
        linked_files: selectedFiles
      });
      setNewTitle('');
      setSelectedFiles([]);
      setIsAdding(false);
      onRefresh();
      toast.success('Task created!');
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await TaskService.delete(taskId);
      onRefresh();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Top Notion-style inline creation bar */}
      {isAdding ? (
        <form onSubmit={handleCreate} style={{
          display: 'flex',
          gap: '8px',
          padding: '8px 12px',
          border: '1px solid var(--border-light)',
          borderRadius: '4px',
          background: 'var(--card-bg)',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="New task..."
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{
              flex: '1 1 200px',
              padding: '6px 10px',
              border: '1px solid var(--border-light)',
              background: 'transparent'
            }}
          />
          <select
            value={selectedColumn}
            onChange={(e) => setSelectedColumn(e.target.value)}
            style={{ padding: '6px 8px', background: 'transparent' }}
          >
            <option value="todo">To-do</option>
            <option value="doing">In progress</option>
            <option value="done">Done</option>
          </select>
          <input
            type="text"
            placeholder="Assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            style={{ width: '100px', padding: '6px 8px', background: 'transparent' }}
          />

          <AttachmentPicker
            allFiles={allFiles}
            selectedFiles={selectedFiles}
            onFilesChange={setSelectedFiles}
            entityType="task"
            onFileUploaded={() => onRefresh()}
          />

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
            Add
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
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
            <Plus size={16} /> <span>New</span>
          </button>
        </div>
      )}

      {/* Notion Board View */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', flex: 1, minHeight: '450px' }}>
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id);
            return (
              <Droppable key={col.id} droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      background: snapshot.isDraggingOver ? 'var(--bg-hover)' : 'transparent',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '4px 0',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {/* Column Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      marginBottom: '8px'
                    }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{col.icon}</span>
                      <span style={{ fontWeight: '500', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {col.title}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 'auto' }}>
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Cards Container */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
                      {colTasks.map((t, index) => (
                        <Draggable key={t.id} draggableId={t.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              style={{
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '4px',
                                padding: '10px 12px',
                                boxShadow: dragSnapshot.isDragging ? '0 8px 16px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.03)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                ...dragProvided.draggableProps.style
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: '400', lineHeight: '1.4' }}>
                                  {t.title}
                                </span>
                                <button
                                  onClick={() => handleDelete(t.id)}
                                  style={{ color: 'var(--text-muted)', padding: '2px' }}
                                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                                <span>{t.assignee || 'Unassigned'}</span>
                                {t.linked_files && t.linked_files.length > 0 && (
                                  <a
                                    href={`http://localhost:8000${t.linked_files[0]}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                                  >
                                    <Paperclip size={12} />
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
