import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Check, X, Minimize2 } from 'lucide-react';
import { ChatService, TaskService } from '../services';
import { webGpuLLM } from '../webgpu-llm';

export default function FloatingCommandPalette({ onCommandExecuted }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTask, setActiveTask] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const commandText = query.trim();
    setQuery('');
    setIsOpen(false);

    const taskId = Date.now().toString();
    setActiveTask({
      id: taskId,
      prompt: commandText,
      status: 'running',
      result: 'WebGPU LLM is reasoning...',
      timestamp: new Date()
    });
    setIsExpanded(false);

    try {
      // 1. Fetch current live task context from database to feed into the WebGPU LLM
      const currentTasks = await TaskService.list().catch(() => []);
      const tasksSummary = currentTasks.map(t => `ID: ${t.id} | Title: "${t.title}" | Status: ${t.status} | Assignee: "${t.assignee || 'Unassigned'}" | Priority: ${t.priority || 'medium'}`).join('\n');

      const systemPrompt = `You are the AI Work OS engine. You execute actions or answer queries using the current tasks database.
Current tasks in DB:
${tasksSummary || 'No tasks currently.'}

Rules:
1. If the user asks a question (e.g. "what is on my todo list", "who is assigned to what"), answer directly and concisely.
2. If the user wants to mutate/create/move/assign (e.g. "assign Auth to Alex", "create task Buy GPU", "move Deploy to done", "assign task 101 to Sarah"), output a valid JSON object:
{
  "action": "create_task" | "move_task" | "assign_task" | "delete_task",
  "title": "task title or task id to target",
  "status": "todo" | "doing" | "done",
  "priority": "high" | "medium" | "low",
  "assignee": "person or team name to assign"
}
3. If it is an answer or explanation, output the plain natural text answer directly without JSON.`;

      let llmOutput = null;

      // 2. Run directly in the client WebGPU LLM
      if (webGpuLLM.isReady) {
        llmOutput = await webGpuLLM.generate(commandText, systemPrompt);
      }

      // If WebGPU LLM not yet compiled or returned empty, call backend LLM pipeline
      if (!llmOutput) {
        const backendResp = await ChatService.send('temporary', commandText);
        llmOutput = backendResp.response;
      }

      // 3. Parse action JSON instruction from LLM output
      let finalResult = llmOutput;
      const jsonMatch = llmOutput && llmOutput.match(/\{[\s\S]*"action"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const actionData = JSON.parse(jsonMatch[0]);

          // --- ASSIGN TASK LOGIC ---
          if (actionData.action === 'assign_task') {
            const targetQuery = (actionData.title || commandText).toLowerCase();
            const assigneeName = actionData.assignee || 'Unassigned';

            // Find matching task by ID or title substring
            const target = currentTasks.find(t => 
              t.id.toLowerCase() === targetQuery ||
              t.title.toLowerCase().includes(targetQuery) ||
              targetQuery.includes(t.title.toLowerCase())
            );

            if (target) {
              await TaskService.update(target.id, { assignee: assigneeName });
              finalResult = `Assigned task "${target.title}" to ${assigneeName}`;
            } else {
              finalResult = `Could not find a matching task to assign to ${assigneeName}.`;
            }
          }
          // --- CREATE TASK LOGIC ---
          else if (actionData.action === 'create_task') {
            const created = await TaskService.create({
              title: actionData.title || commandText,
              status: actionData.status || 'todo',
              priority: actionData.priority || 'medium',
              assignee: actionData.assignee || 'Unassigned',
              linked_files: []
            });
            finalResult = `Created task: "${actionData.title || commandText}" in ${(actionData.status || 'todo').toUpperCase()}${actionData.assignee ? ` assigned to ${actionData.assignee}` : ''}`;
          } 
          // --- MOVE TASK LOGIC ---
          else if (actionData.action === 'move_task') {
            const targetQuery = (actionData.title || commandText).toLowerCase();
            const destStatus = actionData.status || 'done';

            const target = currentTasks.find(t => 
              t.id.toLowerCase() === targetQuery ||
              t.title.toLowerCase().includes(targetQuery) ||
              targetQuery.includes(t.title.toLowerCase())
            );

            if (target) {
              await TaskService.update(target.id, { status: destStatus });
              finalResult = `Moved "${target.title}" to ${destStatus.toUpperCase()}`;
            } else {
              finalResult = `Could not find matching task to move.`;
            }
          }
          // --- DELETE TASK LOGIC ---
          else if (actionData.action === 'delete_task') {
            const targetQuery = (actionData.title || commandText).toLowerCase();
            const target = currentTasks.find(t => 
              t.id.toLowerCase() === targetQuery ||
              t.title.toLowerCase().includes(targetQuery)
            );
            if (target) {
              await TaskService.delete(target.id);
              finalResult = `Deleted task "${target.title}"`;
            }
          }
        } catch (e) {
          console.warn('JSON action parse note:', e);
        }
      }

      setActiveTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        return {
          ...prev,
          status: 'done',
          result: finalResult || 'Done.'
        };
      });

      onCommandExecuted();
    } catch (err) {
      console.error(err);
      setActiveTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        return {
          ...prev,
          status: 'done',
          result: 'Error running WebGPU LLM command.'
        };
      });
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    setActiveTask(null);
    setIsExpanded(false);
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 15, 15, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '16vh',
            zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.16)',
              borderRadius: '6px',
              overflow: 'hidden'
            }}
          >
            <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask WebGPU LLM anything or give a task (e.g. 'assign Auth to Alex')..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: '400'
                }}
              />
              <span style={{
                color: 'var(--text-muted)',
                fontSize: '11px',
                padding: '2px 5px',
                borderRadius: '3px',
                border: '1px solid var(--border-light)',
                fontFamily: 'monospace'
              }}>
                ESC
              </span>
            </form>

            <div style={{ padding: '8px 14px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
              <span>WebGPU LLM Direct Reasoning</span>
              <span>Enter to run</span>
            </div>
          </div>
        </div>
      )}

      {/* Notion Minimal Bottom-Left Pill */}
      {activeTask && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 9000
          }}
        >
          {!isExpanded ? (
            <div
              onClick={() => setIsExpanded(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-strong)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                padding: '6px 12px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                userSelect: 'none'
              }}
            >
              {activeTask.status === 'running' ? (
                <>
                  <Loader2 size={13} color="var(--text-secondary)" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>WebGPU LLM thinking...</span>
                </>
              ) : (
                <>
                  <Check size={14} color="var(--text-primary)" />
                  <span>Done</span>
                  <button
                    onClick={handleDismiss}
                    style={{
                      color: 'var(--text-muted)',
                      display: 'flex',
                      padding: '2px',
                      marginLeft: '2px'
                    }}
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                width: '340px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                padding: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12.5px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                  {activeTask.status === 'done' ? 'WebGPU LLM Answer' : 'Reasoning...'}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => setIsExpanded(false)} style={{ color: 'var(--text-muted)', padding: '2px' }}>
                    <Minimize2 size={12} />
                  </button>
                  {activeTask.status === 'done' && (
                    <button onClick={handleDismiss} style={{ color: 'var(--text-muted)', padding: '2px' }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ color: 'var(--text-secondary)' }}>"{activeTask.prompt}"</div>

              <div style={{
                background: 'var(--bg-secondary)',
                padding: '8px 10px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                color: 'var(--text-primary)',
                maxHeight: '180px',
                overflowY: 'auto'
              }}>
                {activeTask.result}
              </div>

              {activeTask.status === 'done' && (
                <button
                  onClick={handleDismiss}
                  style={{
                    background: 'var(--text-primary)',
                    color: 'var(--bg-primary)',
                    fontWeight: '500',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    marginTop: '2px'
                  }}
                >
                  <X size={12} /> Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
