import React, { useState, useEffect, useRef } from 'react';
import { Send, Volume2, Sparkles, Database, Plus, Trash2, MessageSquare, Wrench, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { ChatService, FileService, TaskService, EventService, WorkDoneService } from '../services';
import { webGpuLLM } from '../webgpu-llm';
import { detectIntentFromQuery, parseLLMOutput, refineToolData } from '../intent-detection';

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
    return parseLLMOutput(rawText);
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
      const allEvents = await EventService.list();
      const monthFilter = toolData.month ? toolData.month.toLowerCase() : "";
      
      let filtered = allEvents;
      if (monthFilter) {
        filtered = allEvents.filter(e => {
          const d = (e.event_date || "").toLowerCase();
          const desc = (e.description || "").toLowerCase();
          return d.includes(monthFilter) || desc.includes(monthFilter);
        });
      }

      if (filtered.length > 0) {
        const eventLines = filtered.map(e => `• **${e.title}** [${e.category}] on ${e.event_date}: ${e.description}`);
        return {
          raw_data: filtered,
          entity_type: 'event',
          text: `Logged Company Events${monthFilter ? ` for ${monthFilter}` : ''}:\n\n${eventLines.join('\n')}`,
          sources: []
        };
      } else {
        return {
          raw_data: [],
          entity_type: 'event',
          text: `No company events or meetings found${monthFilter ? ` in ${monthFilter}` : ''}.`,
          sources: []
        };
      }
    }

    if (toolName === "get_work_done" || toolName.includes("work")) {
      const logs = await WorkDoneService.list();
      if (logs.length > 0) {
        const workLines = logs.map(l => `• **${l.title}** by *${l.completed_by}* — ${l.notes}`);
        return {
          raw_data: logs,
          entity_type: 'work_done',
          text: `Completed Work Log:\n\n${workLines.join('\n')}`,
          sources: []
        };
      } else {
        return { 
          raw_data: [],
          entity_type: 'work_done',
          text: "No completed work deliverables recorded yet.", 
          sources: [] 
        };
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
      // ReAct Loop Context (Structured for Llama 3.2 1B Instruct)
      const reActSystemPrompt = `You are an AI Work OS Agent. Given the user query, reason with a Thought, then choose the EXACT matching tool Action.

TOOLS (in order of priority):
1. get_events: query company calendar, meetings, events, announcements, conferences, summits, keynotes, schedule.
   Parameters: month (e.g. "november"), query (string)
2. get_work_done: query deliverables, proof of work, logged completed milestones, work logs, achievements, accomplished work.
   Parameters: none
3. get_tasks: query kanban tasks and to-dos, task status, assignments.
   Parameters: status (todo|doing|done|all), priority (high|medium|low), assignee (string)
4. search_files: search documents, OCR notes, uploaded PDFs, files, reports, presentations.
   Parameters: query (string)
5. create_task: create a new task.
   Parameters: title, status, priority, assignee
6. assign_task: reassign a task.
   Parameters: task_title, assignee
7. move_task: move task status.
   Parameters: task_title, status

IMPORTANT RULES:
- Do NOT use get_tasks when the user asks about events, meetings, conferences, calendar, schedule, upcoming events, or work logs.
- Use get_events for anything about calendar, meetings, conferences, announcements, summits, or schedule.
- Use get_work_done for anything about work logs, deliverables, what was accomplished, completed work, or milestones.

You MUST output EXACTLY this format:

Thought: [your reasoning about which tool to use]
Action:
tool: [tool_name]
[param]: [value]

EXAMPLES:

Query: did you see any new events in nov this year
Thought: The user is asking about calendar events in November. I must call get_events.
Action:
tool: get_events
month: november

Query: any events in november
Thought: The user wants events for November. I will call get_events with month november.
Action:
tool: get_events
month: november

Query: upcoming meetings
Thought: The user wants to know about upcoming meetings. Meetings are events. I must call get_events.
Action:
tool: get_events

Query: what's on the calendar
Thought: The user is asking about the calendar schedule. I must call get_events.
Action:
tool: get_events

Query: any conferences this month
Thought: Conferences are events. I must call get_events.
Action:
tool: get_events

Query: are there any meetings this week
Thought: Meetings are calendar events. I must call get_events.
Action:
tool: get_events

Query: any announcements or conferences coming up
Thought: Announcements and conferences are events. I must call get_events.
Action:
tool: get_events

Query: what is my work log
Thought: The user is asking for their work log, which means deliverables and completed work. I must call get_work_done.
Action:
tool: get_work_done

Query: what did I deliver
Thought: The user wants to know what was delivered. This is about completed work. I must call get_work_done.
Action:
tool: get_work_done

Query: show completed work
Thought: The user wants completed work records. I must call get_work_done.
Action:
tool: get_work_done

Query: what has been accomplished
Thought: The user is asking about accomplishments, which are work deliverables. I must call get_work_done.
Action:
tool: get_work_done

Query: what did the team accomplish
Thought: The user asks about team accomplishments. I must call get_work_done.
Action:
tool: get_work_done

Query: show me completed milestones
Thought: Milestones are completed work items. I must call get_work_done.
Action:
tool: get_work_done

Query: what tasks are in progress right now
Thought: The user is asking for tasks in progress. I will call get_tasks with status doing.
Action:
tool: get_tasks
status: doing

Query: what urgent tasks should I do
Thought: The user is asking for pending high priority tasks. I will call get_tasks with status todo and priority high.
Action:
tool: get_tasks
status: todo
priority: high

Query: what should I do urgently
Thought: The user needs urgent pending tasks. I must call get_tasks with status todo and priority high.
Action:
tool: get_tasks
status: todo
priority: high

Query: pending to-dos
Thought: The user wants pending tasks. I will call get_tasks with status todo.
Action:
tool: get_tasks
status: todo

Query: search files for quarterly roadmap
Thought: The user wants to find documents about quarterly roadmap. I will call search_files.
Action:
tool: search_files
query: quarterly roadmap

Query: find the quarterly report
Thought: The user wants to find a report file. I will call search_files.
Action:
tool: search_files
query: quarterly report

Query: search for meeting notes
Thought: The user wants to find meeting notes in files. I will call search_files.
Action:
tool: search_files
query: meeting notes`;

      // --- ReAct Cycle 1: Thought & Action ---
      setAgentSteps(prev => [
        ...prev,
        { type: 'thought', text: `Analyzing user goal: "${userText}"... Planning tool action.` }
      ]);

      let cycle1Output = "";
      try {
        cycle1Output = await webGpuLLM.generate(`Query: ${userText}`, reActSystemPrompt);
      } catch (err) {
        console.warn("ReAct Cycle 1 error:", err);
      }

      // Extract Thought from model output
      let modelThought = "";
      if (cycle1Output.includes("Action:")) {
        modelThought = cycle1Output.split("Action:")[0].replace(/^Thought:\s*/i, '').trim();
      } else if (cycle1Output.includes("tool:")) {
        modelThought = cycle1Output.split("tool:")[0].replace(/^Thought:\s*/i, '').trim();
      }
      if (modelThought) {
        setAgentSteps(prev => [
          ...prev,
          { type: 'thought', text: modelThought }
        ]);
      }

      // Extract Action (TOON)
      let toolData = parseToonOrFallback(cycle1Output);

      // Post-process: refine tool data with user query context
      if (toolData && toolData.tool) {
        toolData = refineToolData(toolData, userText);
      }

      // If model failed to output an action, use keyword-based intent detection
      if (!toolData || !toolData.tool) {
        toolData = detectIntentFromQuery(userText);
      }

      const toolParamsText = Object.entries(toolData)
        .filter(([k]) => k !== 'tool')
        .map(([k, v]) => `${k}: "${v}"`)
        .join(', ');

      // Log Action
      setAgentSteps(prev => [
        ...prev,
        { type: 'tool', text: `Action: ${toolData.tool}(${toolParamsText || 'none'})` }
      ]);

      // --- ReAct Execution: Observation ---
      const resultObj = await executeToolCall(toolData, userText);
      const observationText = resultObj.text;
      const citedSources = resultObj.sources || [];

      // Log Observation
      setAgentSteps(prev => [
        ...prev,
        { type: 'observation', text: `Observation: ${observationText.split('\n')[0]}` }
      ]);

      // --- ReAct Cycle 2: Thought & Final Answer Synthesis ---
      setAgentSteps(prev => [
        ...prev,
        { type: 'thought', text: `Reviewing observation... Synthesizing final answer.` }
      ]);

      const cycle2System = reActSystemPrompt;
      const cycle2User = `User asked: "${userText}"

You called tool: ${toolData.tool} and got this observation:
"""
${observationText}
"""

Now write a helpful, natural language Final Answer for the user based on this observation. Be concise and conversational. Do not dump raw data.

Final Answer:`;

      let finalOutput = "";
      try {
        finalOutput = await webGpuLLM.generate(cycle2User, cycle2System);
      } catch (e) {
        console.warn('ReAct Cycle 2 error:', e);
      }

      let cleanFinalAnswer = finalOutput
        ? finalOutput.replace(/^Final Answer:\s*/i, '').trim()
        : "";

      if (!cleanFinalAnswer || cleanFinalAnswer.length === 0) {
        cleanFinalAnswer = observationText;
      }

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        content: cleanFinalAnswer,
        sources: citedSources,
        steps: [...agentSteps]
      } : m));

      await ChatService.saveTurn(activeSessionId, userText, cleanFinalAnswer, citedSources).catch(console.warn);
      loadSessions();

      try {
        const ttsData = await ChatService.tts(cleanFinalAnswer.replace(/[*#•]/g, ''));
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
            Initializing Llama 3.2 (WebGPU)
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
