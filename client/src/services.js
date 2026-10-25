import axios from "axios";

// Read from VITE_API_URL if configured, fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" }
});

export const TaskService = {
  list: () => apiClient.get("/tasks").then(r => r.data),
  create: (data) => apiClient.post("/tasks", data).then(r => r.data),
  update: (id, updates) => apiClient.put(`/tasks/${id}`, updates).then(r => r.data),
  delete: (id) => apiClient.delete(`/tasks/${id}`).then(r => r.data)
};

export const EventService = {
  list: () => apiClient.get("/events").then(r => r.data),
  create: (data) => apiClient.post("/events", data).then(r => r.data)
};

export const WorkDoneService = {
  list: (user_email = "", role = "spectator") => 
    apiClient.get(`/work-done?user_email=${encodeURIComponent(user_email)}&role=${encodeURIComponent(role)}`).then(r => r.data),
  create: (data) => apiClient.post("/work-done", data).then(r => r.data)
};

export const UserService = {
  sync: (data) => apiClient.post("/users/sync", data).then(r => r.data),
  list: (requester_email) => apiClient.get(`/users?requester_email=${encodeURIComponent(requester_email)}`).then(r => r.data),
  updateRole: (target_email, role, status = "active", requester_email) => 
    apiClient.put(`/users/${encodeURIComponent(target_email)}/role?requester_email=${encodeURIComponent(requester_email)}`, { role, status }).then(r => r.data)
};

export const TimelineService = {
  list: () => apiClient.get("/timeline").then(r => r.data),
  revert: (id) => apiClient.post(`/timeline/${id}/revert`).then(r => r.data)
};

export const FileService = {
  list: (query = "") => apiClient.get(`/files${query ? `?search=${encodeURIComponent(query)}` : ""}`).then(r => r.data),
  upload: (file, linked_type = null, linked_id = null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (linked_type) formData.append("linked_type", linked_type);
    if (linked_id) formData.append("linked_id", linked_id);
    return apiClient.post("/files/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    }).then(r => r.data);
  }
};

export const ChatService = {
  send: (mode, message, session_id = "default") => apiClient.post("/chat", { mode, message, session_id }).then(r => r.data),
  history: (session_id = "default") => apiClient.get(`/chat/history?session_id=${encodeURIComponent(session_id)}`).then(r => r.data),
  listSessions: () => apiClient.get("/chat/sessions").then(r => r.data),
  createSession: (title = "New Chat") => apiClient.post("/chat/sessions", { title }).then(r => r.data),
  deleteSession: (sessionId) => apiClient.delete(`/chat/sessions/${sessionId}`).then(r => r.data),
  saveTurn: (session_id, user_prompt, assistant_reply, sources = []) => apiClient.post("/chat/save-turn", {
    session_id,
    user_prompt,
    assistant_reply,
    sources
  }).then(r => r.data),
  tts: (text) => {
    const fd = new FormData();
    fd.append("text", text);
    return apiClient.post("/tts", fd, {
      headers: { "Content-Type": "multipart/form-data" }
    }).then(r => r.data);
  }
};
