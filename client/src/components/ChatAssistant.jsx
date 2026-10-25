import React, { useState, useEffect, useRef } from 'react';
import { Send, Volume2, Sparkles, Database, Plus, Trash2, MessageSquare, Wrench, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { decode as decodeToon } from '@toon-format/toon';
import { ChatService, FileService, TaskService, EventService, WorkDoneService } from '../services';
import { webGpuLLM } from '../webgpu-llm';

export default function ChatAssistant() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('default');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]); // [{ type: 'thought'|'tool'|'observation', text: '', time: '' }]
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatusText, setLoadStatusText] = useState('Preparing WebGPU...');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const loadSessions = async () => {
    try {
      const sessList = await ChatService.listSessions();
      setSessions(sessList);
      if (sessList.length > 0 && !sessList.some(s => s.id === activeSessionId)) {
        setActiveSessionId(sessList[0].id);
      }
    } catch (e) {
      console.error('Session load error:', e);
    }
  };

  const loadMessages = async (sessId) => {
    try {
      const history = await ChatService.history(sessId);
      setMessages(history);
    } catch (e) {
      console.error('History load error:', e);
    }
  };

  useEffect(() => {
    loadSessions();

    webGpuLLM.init((text, progress) => {
      setLoadProgress(Math.min(100, Math.round(progress * 100)));
      setLoadStatusText(text || 'Compiling WebGPU shaders...');
      if (progress >= 1.0) {
        setTimeout(() => setIsModelLoading(false), 200);
      }
    }).catch(err => {
      console.error('WebGPU Init error:', err);
      setIsModelLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, agentSteps]);

  const handleCreateNewChat = async () => {
    try {
      const newSess = await ChatService.createSession(`Chat ${sessions.length + 1}`);
      setSessions(prev => [newSess, ...prev]);
      setActiveSessionId(newSess.id);
      setMessages([]);
      toast.success('Created new chat');
    } catch {
      toast.error('Failed to create new chat');
    }
  };

  const handleDeleteSession = async (e, sessId) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      toast.error('Cannot delete the only chat');
      return;
    }
    try {
      await ChatService.deleteSession(sessId);
      const remaining = sessions.filter(s => s.id !== sessId);
      setSessions(remaining);
      if (activeSessionId === sessId) {
        setActiveSessionId(remaining[0].id);
      }
      toast.success('Chat deleted');
    } catch {
      toast.error('Failed to delete chat');
    }
  };

  // Immediate Stop Action
  const handleStop = () => {
    webGpuLLM.interrupt();
    setLoading(false);
    setAgentSteps([]);
    setThinkingSeconds(0);
    toast('Generation stopped', { icon: '⏹' });
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const parseToonOrFallback = (rawText) => {
    if (!rawText) return null;
    try {
      const cleanText = rawText.replace(/```(toon)?/g, '').trim();
      const parsed = decodeToon(cleanText);
      if (parsed && typeof parsed === 'object' && parsed.tool) {
        return parsed;
      }
    } catch {
      const toolMatch = rawText.match(/tool:\s*([a-zA-Z0-9_-]+)/i);
      if (toolMatch) {
        const obj = { tool: toolMatch[1].trim() };
        const lines = rawText.split('\n');
        for (const line of lines) {
          const parts = line.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();
            if (key !== 'tool' && key && val) {
              obj[key] = val;
            }
          }
        }
        return obj;
      }
    }
    return null;
  };

  const executeToolCall = async (toolData, userText) => {
    const toolName = (toolData.tool || "").toLowerCase().trim();

    if (toolName === "get_tasks") {
      const allTasks = await TaskService.list();
      const targetStatus = (toolData.status || "all").toLowerCase().trim();
      const targetPriority = (toolData.priority || "").toLowerCase().trim();

      let filtered = allTasks;
      if (["todo", "doing", "done"].includes(targetStatus)) {
        filtered = filtered.filter(t => (t.status || "").toLowerCase() === targetStatus);
      }
      if (["high", "medium", "low"].includes(targetPriority)) {
        filtered = filtered.filter(t => (t.priority || "").toLowerCase() === targetPriority);
      }

      if (filtered.length > 0) {
        const lines = filtered.map(t => `• **${t.title}** (${(t.status || '').toUpperCase()}) — Assigned to: *${t.assignee || 'Unassigned'}* [Priority: ${t.priority || 'medium'}]`);
        return {
          raw_data: filtered,
          text: `Found ${filtered.length} task(s)${targetStatus !== 'all' ? ` in '${targetStatus.toUpperCase()}'` : ''}${targetPriority ? ` [Priority: ${targetPriority}]` : ''}:\n\n${lines.join('\n')}`,
          sources: []
        };
      } else {
        return {
          raw_data: [],
          text: `There are currently 0 tasks matching criteria (status: ${targetStatus}, priority: ${targetPriority || 'any'}). (Total tasks: ${allTasks.length})`,
          sources: []
        };
      }
    }

    if (toolName === "search_files" || toolName.includes("file") || toolName.includes("doc")) {
      const query = toolData.query || userText;
      const files = await FileService.list(query);
      const cited = files.slice(0, 3).map(f => f.original_filename);
      if (files.length > 0) {
        const fileSnippets = files.slice(0, 3).map(f => `📄 **${f.original_filename}**\n${f.summary || f.extracted_text?.slice(0, 180)}`).join('\n\n');
        return {
          text: `Found matching documents:\n\n${fileSnippets}`,
          sources: cited
        };
      } else {
        return {
          text: `No files matched the search query '${query}' in the vector database.`,
          sources: []
        };
      }
    }

    if (toolName === "get_events" || toolName.includes("event") || toolName.includes("meeting")) {
      const events = await EventService.list();
      if (events.length > 0) {
        const eventLines = events.map(e => `📅 **${e.title}** [${e.category}] on ${e.event_date}: ${e.description}`);
        return {
          text: `Logged Company Events:\n\n${eventLines.join('\n')}`,
          sources: []
        };
      } else {
        return { text: "No outside events or meetings logged.", sources: [] };
      }
    }

    if (toolName === "get_work_done" || toolName.includes("work")) {
      const logs = await WorkDoneService.list();
      if (logs.length > 0) {
        const workLines = logs.map(l => `✓ **${l.title}** by *${l.completed_by}* — ${l.notes}`);
        return {
          text: `Completed Work Log:\n\n${workLines.join('\n')}`,
          sources: []
        };
      } else {
        return { text: "No completed work deliverables recorded yet.", sources: [] };
      }
    }

    if (toolName === "create_task") {
      const created = await TaskService.create({
        title: toolData.title || userText,
        status: toolData.status || "todo",
        priority: toolData.priority || "medium",
        assignee: toolData.assignee || "Unassigned"
      });
      return {
        text: `Created task **"${created.title}"** in **${created.status.toUpperCase()}** (Assigned: ${created.assignee}).`,
        sources: []
      };
    }

    if (toolName === "assign_task") {
      const allTasks = await TaskService.list();
      const target = allTasks.find(t => t.title.toLowerCase().includes((toolData.task_title || '').toLowerCase()));
      if (target) {
        await TaskService.update(target.id, { assignee: toolData.assignee });
        return {
          text: `Assigned task **"${target.title}"** to **${toolData.assignee}**.`,
          sources: []
        };
      }
      return { text: `Could not locate a task matching "${toolData.task_title}".`, sources: [] };
    }

    if (toolName === "move_task") {
      const allTasks = await TaskService.list();
      const target = allTasks.find(t => t.title.toLowerCase().includes((toolData.task_title || '').toLowerCase()));
      if (target) {
        await TaskService.update(target.id, { status: toolData.status });
        return {
          text: `Moved task **"${target.title}"** to **${toolData.status.toUpperCase()}**.`,
          sources: []
        };
      }
      return { text: `Could not locate a task matching "${toolData.task_title}".`, sources: [] };
    }

    return {
      text: `Processed instruction: "${userText}".`,
      sources: []
    };
  };

  const handleSend = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!input.trim() || loading || isModelLoading) return;

    const userText = input.trim();
    setInput('');

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', content: userText, timestamp: new Date().toISOString() },
      { id: assistantMsgId, role: 'assistant', content: '', sources: [], timestamp: new Date().toISOString() }
    ]);

    setLoading(true);
    setAgentSteps([]);
    setThinkingSeconds(0);

    const timerInterval = setInterval(() => {
      setThinkingSeconds(prev => prev + 1);
    }, 1000);

    try {
      // Step 1: Agent Thinking & Plan Formulation
      setAgentSteps(prev => [
        ...prev,
        { type: 'thought', text: `Analyzing user intent: "${userText}"... Determining required tool execution.` }
      ]);

      const toolPlanningPrompt = `<start_of_turn>user
You are the local AI Work OS Planner.
Select exactly ONE tool and respond ONLY in TOON format (tool name followed by key: value attributes). Do not output conversational chit-chat.

AVAILABLE TOOLS:
- get_tasks: fetch tasks (status: all, todo, doing, done, priority: high, medium, low)
- search_files: search indexed documents & OCR files (query: string)
- get_events: list calendar events, meetings, milestones
- get_work_done: list logged deliverables, proof of work, completed milestones
- create_task: create a new task (title: string, status: todo/doing/done, priority: high/medium/low, assignee: string)
- assign_task: reassign an existing task (task_title: string, assignee: string)
- move_task: update task status (task_title: string, status: todo/doing/done)

FEW-SHOT EXAMPLES:
User: what tasks are in progress rn?
Plan:
tool: get_tasks
status: doing

User: what are the tasks that i should do urgently
Plan:
tool: get_tasks
status: todo
priority: high

User: what tasks have high priority?
Plan:
tool: get_tasks
priority: high

User: show me all todo items
Plan:
tool: get_tasks
status: todo

User: what have we finished so far?
Plan:
tool: get_tasks
status: done

User: list all our tasks
Plan:
tool: get_tasks
status: all

User: create a high priority task for API testing assigned to Sarah
Plan:
tool: create_task
title: API testing
status: todo
priority: high
assignee: Sarah

User: assign FAISS indexing to Alex
Plan:
tool: assign_task
task_title: FAISS indexing
assignee: Alex

User: move Database Setup to done
Plan:
tool: move_task
task_title: Database Setup
status: done

User: what upcoming meetings or company events do we have?
Plan:
tool: get_events

User: find the quarterly revenue report and OCR notes
Plan:
tool: search_files
query: quarterly revenue report

User: what work was delivered or logged today?
Plan:
tool: get_work_done

User: ${userText}
Plan:<end_of_turn>
<start_of_turn>model
`;

      let stage1Output = "";
      try {
        stage1Output = await webGpuLLM.generate(toolPlanningPrompt);
      } catch (err) {
        console.warn("Stage 1 notice:", err);
      }

      let toolData = parseToonOrFallback(stage1Output);
      const lowerQuery = (userText || "").toLowerCase();

      // RSI Semantic Disambiguation: Ensure parameters match user intent exactly
      if (!toolData || !toolData.tool || (toolData.tool === 'get_tasks' && toolData.status === 'all')) {
        if (lowerQuery.includes("urgent") || lowerQuery.includes("urgently") || lowerQuery.includes("asap")) {
          toolData = { tool: "get_tasks", status: "todo", priority: "high" };
        } else if (lowerQuery.includes("progress") || lowerQuery.includes("doing") || lowerQuery.includes("active")) {
          toolData = { tool: "get_tasks", status: "doing" };
        } else if (lowerQuery.includes("todo") || lowerQuery.includes("to do") || lowerQuery.includes("should do") || lowerQuery.includes("need to do")) {
          toolData = { tool: "get_tasks", status: "todo" };
        } else if (lowerQuery.includes("done") || lowerQuery.includes("finished") || lowerQuery.includes("completed")) {
          toolData = { tool: "get_tasks", status: "done" };
        } else if (lowerQuery.includes("event") || lowerQuery.includes("meeting")) {
          toolData = { tool: "get_events" };
        } else if (lowerQuery.includes("file") || lowerQuery.includes("doc")) {
          toolData = { tool: "search_files", query: userText };
        } else if (lowerQuery.includes("work") || lowerQuery.includes("deliverable")) {
          toolData = { tool: "get_work_done" };
        } else {
          toolData = toolData || { tool: "get_tasks", status: "all" };
        }
      }

      // Enforce status & priority criteria for task queries
      if (toolData && toolData.tool === 'get_tasks') {
        if ((lowerQuery.includes("should do") || lowerQuery.includes("need to do") || lowerQuery.includes("urgent")) && !toolData.status) {
          toolData.status = "todo";
        }
        if ((lowerQuery.includes("urgent") || lowerQuery.includes("urgently") || lowerQuery.includes("asap")) && !toolData.priority) {
          toolData.priority = "high";
        }
      }

      const toolParamsText = Object.entries(toolData)
        .filter(([k]) => k !== 'tool')
        .map(([k, v]) => `${k}: "${v}"`)
        .join(', ');

      // Step 2: Agent Tool Call
      setAgentSteps(prev => [
        ...prev,
        { type: 'tool', text: `Calling Tool: ${toolData.tool}(${toolParamsText || 'none'})` }
      ]);

      // Execute tool
      const resultObj = await executeToolCall(toolData, userText);
      const toolOutputSummary = resultObj.text;
      const citedSources = resultObj.sources || [];

      // Step 3: Tool Observation
      setAgentSteps(prev => [
        ...prev,
        { type: 'observation', text: `Tool Output: ${toolOutputSummary.split('\n')[0]}` }
      ]);

      // Step 4: Agent Reasoning & Natural Language Synthesis
      setAgentSteps(prev => [
        ...prev,
        { type: 'thought', text: `Analyzing observation: formulating precise natural response focused strictly on "${userText}".` }
      ]);

      const synthesisPrompt = `<start_of_turn>user
You are Gemma, the local AI Work OS executive assistant.
Context: You executed tool "${toolData.tool}" with params (${toolParamsText || 'none'}).

USER QUERY:
"${userText}"

TOOL OBSERVATION:
"""
${toolOutputSummary}
"""

STRICT INSTRUCTIONS:
1. Formulate a direct, natural language answer to the user in 1-3 conversational sentences.
2. If the user asked about urgent or high priority tasks, focus ONLY on urgent/high priority items.
3. If the user asked about tasks in progress ("doing"), mention ONLY tasks that are currently in progress.
4. If no tasks match, state clearly that no items match the request.
5. Do NOT simply repeat "Found X task(s): • Task..." raw lists. Speak conversationally as a helpful colleague.<end_of_turn>
<start_of_turn>model
`;

      let finalNaturalLanguageReply = "";
      try {
        finalNaturalLanguageReply = await webGpuLLM.generate(synthesisPrompt);
      } catch (e) {
        console.warn('Synthesis fallback note:', e);
      }

      // If synthesis is empty or failed, produce an accurate, factual natural language response
      if (!finalNaturalLanguageReply || finalNaturalLanguageReply.trim().length === 0) {
        const tasksFound = resultObj.raw_data || [];
        if (tasksFound.length === 0) {
          if (toolData.priority === 'high' || lowerQuery.includes("urgent")) {
            finalNaturalLanguageReply = "You have no urgent tasks pending in your to-do list right now.";
          } else if (toolData.status === 'doing' || lowerQuery.includes("progress")) {
            finalNaturalLanguageReply = "There are no tasks currently in progress.";
          } else if (toolData.status === 'todo') {
            finalNaturalLanguageReply = "You have no pending tasks on your to-do board.";
          } else {
            finalNaturalLanguageReply = resultObj.text;
          }
        } else {
          if (toolData.priority === 'high' || lowerQuery.includes("urgent")) {
            if (tasksFound.length === 1) {
              const t = tasksFound[0];
              finalNaturalLanguageReply = `You have 1 urgent task that needs attention: "${t.title}" (assigned to ${t.assignee || 'Unassigned'}).`;
            } else {
              const taskList = tasksFound.map(t => `"${t.title}" (assigned to ${t.assignee || 'Unassigned'})`).join(', ');
              finalNaturalLanguageReply = `Here are the urgent tasks you should tackle first: ${taskList}.`;
            }
          } else if (toolData.status === 'doing' || lowerQuery.includes("progress")) {
            const taskList = tasksFound.map(t => `"${t.title}" (${t.assignee || 'Unassigned'})`).join(', ');
            finalNaturalLanguageReply = `Currently in progress: ${taskList}.`;
          } else {
            const taskList = tasksFound.map(t => `"${t.title}"`).join(', ');
            finalNaturalLanguageReply = `You have ${tasksFound.length} task(s) on your to-do list: ${taskList}.`;
          }
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        content: finalNaturalLanguageReply,
        sources: citedSources,
        steps: [...agentSteps]
      } : m));

      await ChatService.saveTurn(activeSessionId, userText, finalNaturalLanguageReply, citedSources).catch(console.warn);
      loadSessions();

      try {
        const ttsData = await ChatService.tts(finalNaturalLanguageReply.replace(/[*#•]/g, ''));
        const ttsUrl = ttsData?.audio_url;
        if (ttsUrl) {
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, tts_audio_url: ttsUrl } : m));
        }
      } catch (e) {
        console.warn('TTS note:', e);
      }
    } catch (err) {
      console.error('Agent execution error:', err);
      toast.error(err.message || 'Execution error');
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        content: `Error: ${err.message || 'Execution error.'}`
      } : m));
    } finally {
      clearInterval(timerInterval);
      setLoading(false);
      setAgentSteps([]);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend(e);
    }
  };

  const playTTS = (url) => {
    if (url) {
      const audio = new Audio(`http://localhost:8000${url}`);
      audio.play().catch(e => console.log('Audio playback note:', e));
    }
  };

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)',
      borderLeft: '1px solid var(--border-light)',
      overflow: 'hidden'
    }}>
      {/* Loading Blur Overlay */}
      {isModelLoading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(10px)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px',
          textAlign: 'center'
        }}>
          <Sparkles size={32} color="var(--text-primary)" style={{ marginBottom: '14px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Initializing Gemma 3 (WebGPU)
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '280px', marginBottom: '18px' }}>
            Allocating model shaders into GPU VRAM.
          </p>
          <div style={{ width: '100%', maxWidth: '240px', height: '6px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: `${Math.max(5, loadProgress)}%`, height: '100%', background: 'var(--text-primary)', transition: 'width 0.25s ease' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{loadStatusText} ({loadProgress}%)</span>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: '500', fontSize: '13.5px', color: 'var(--text-primary)' }}>
              Llama 3.2 Agent
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              • WebGPU Local SLM
            </span>
          </div>

          <button
            onClick={handleCreateNewChat}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-light)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="Create a new conversation"
          >
            <Plus size={13} /> <span>New Chat</span>
          </button>
        </div>

        {/* Sessions Tab Bar */}
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
          {sessions.map(s => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  border: isActive ? '1px solid var(--border-strong)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  maxWidth: '150px'
                }}
              >
                <MessageSquare size={11} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {s.title || 'Conversation'}
                </span>
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    style={{ color: 'var(--text-muted)', display: 'flex', padding: '1px' }}
                    title="Delete Chat"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div style={{
        flex: 1,
        padding: '16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 'auto' }}>
            Ask anything: "what are in progress rn?", "create task X", or "search documents".
          </div>
        ) : (
          messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id || idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '13.5px',
                  lineHeight: '1.5'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: '500', color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {isUser ? 'You' : 'Llama 3.2 (WebGPU)'}
                  </span>
                  {!isUser && m.tts_audio_url && (
                    <button
                      onClick={() => playTTS(m.tts_audio_url)}
                      style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }}
                    >
                      <Volume2 size={12} /> Listen
                    </button>
                  )}
                </div>

                <div style={{
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  background: isUser ? 'var(--bg-secondary)' : 'transparent',
                  padding: isUser ? '8px 12px' : '2px 0',
                  borderRadius: '4px'
                }}>
                  {m.content || (loading && !isUser && idx === messages.length - 1 ? (
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={12} /> Processing request...
                    </span>
                  ) : null)}
                </div>

                {m.sources && m.sources.length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Database size={11} /> Cited: {m.sources.join(', ')}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live Thought, Tool Call & Observation Trace */}
        {loading && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            padding: '10px 12px',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
                <Sparkles size={12} className="animate-spin text-[#2563eb]" /> Agent Reasoning Trace
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                Thinking: {thinkingSeconds}s
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {agentSteps.map((step, sIdx) => {
                if (step.type === 'thought') {
                  return (
                    <div key={sIdx} style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>💭</span>
                      <span>{step.text}</span>
                    </div>
                  );
                }
                if (step.type === 'tool') {
                  return (
                    <div key={sIdx} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-light)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '11.5px'
                    }}>
                      <Wrench size={12} />
                      <strong>{step.text}</strong>
                    </div>
                  );
                }
                if (step.type === 'observation') {
                  return (
                    <div key={sIdx} style={{ color: 'var(--text-muted)', fontSize: '11.5px', paddingLeft: '20px' }}>
                      ↳ {step.text}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area with STOP button during generation */}
      <form onSubmit={handleSend} style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder={isModelLoading ? 'Loading WebGPU model...' : (loading ? 'Generating... (Click stop to cancel)' : 'Type message... (Ctrl + Enter to send)')}
            value={input}
            disabled={isModelLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              padding: '8px 10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              borderRadius: '4px',
              opacity: isModelLoading ? 0.6 : 1,
              resize: 'none',
              fontFamily: 'inherit',
              fontSize: '13px',
              lineHeight: '1.4'
            }}
          />

          {/* Conditional Send / Stop Button */}
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                fontWeight: '500',
                padding: '8px 12px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                height: '36px',
                fontSize: '12px'
              }}
              title="Stop Generation"
            >
              <Square size={12} fill="currentColor" /> Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || isModelLoading}
              style={{
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                fontWeight: '500',
                padding: '8px 12px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                height: '36px',
                opacity: (!input.trim() || isModelLoading) ? 0.4 : 1
              }}
              title="Send message (or press Ctrl + Enter)"
            >
              <Send size={13} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>{loading ? 'Click Stop to cancel' : 'Ready'}</span>
          <span><kbd style={{ background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border-light)', fontFamily: 'monospace' }}>Ctrl + Enter</kbd> to send</span>
        </div>
      </form>
    </div>
  );
}
