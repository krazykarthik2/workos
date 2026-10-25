const API_BASE = "http://localhost:8000";

export const api = {
  // Tasks (Kanban)
  getTasks: () => fetch(`${API_BASE}/api/tasks`).then(r => r.json()),
  createTask: (data) => fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateTask: (id, updates) => fetch(`${API_BASE}/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  }).then(r => r.json()),
  deleteTask: (id) => fetch(`${API_BASE}/api/tasks/${id}`, { method: "DELETE" }).then(r => r.json()),

  // Events Tracker
  getEvents: () => fetch(`${API_BASE}/api/events`).then(r => r.json()),
  createEvent: (data) => fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  // Work Done Tracker
  getWorkDone: () => fetch(`${API_BASE}/api/work-done`).then(r => r.json()),
  createWorkDone: (data) => fetch(`${API_BASE}/api/work-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  // Timeline & Reversibility
  getTimeline: () => fetch(`${API_BASE}/api/timeline`).then(r => r.json()),
  revertAction: (timelineId) => fetch(`${API_BASE}/api/timeline/${timelineId}/revert`, { method: "POST" }).then(r => r.json()),

  // AI Files & Vector Search
  getFiles: (query = "") => {
    const url = query ? `${API_BASE}/api/files?search=${encodeURIComponent(query)}` : `${API_BASE}/api/files`;
    return fetch(url).then(r => r.json());
  },
  uploadFile: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${API_BASE}/api/files/upload`, {
      method: "POST",
      body: fd
    }).then(r => r.json());
  },

  // Dual-Mode Chat
  sendChat: (mode, message) => fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, message })
  }).then(r => r.json()),
  getChatHistory: () => fetch(`${API_BASE}/api/chat/history`).then(r => r.json())
};
export { API_BASE };
