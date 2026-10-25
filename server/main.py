import os
import uuid
import shutil
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_database
from timeline import record_event, revert_action
from vector_store import vector_manager
from file_processor import extract_text_from_file, generate_summary
from tts_engine import tts_service
from ai_agent import execute_temporary_command, query_context_assistant

app = FastAPI(title="Local AI Work OS Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
TTS_DIR = os.path.join(os.path.dirname(__file__), "tts_cache")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)

app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/static/tts", StaticFiles(directory=TTS_DIR), name="tts")

# --- Helper to clean MongoDB docs of ObjectIds ---
def clean_doc(doc):
    if not isinstance(doc, dict):
        return doc
    cleaned = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, dict):
            cleaned[k] = clean_doc(v)
        elif isinstance(v, list):
            cleaned[k] = [clean_doc(i) for i in v]
        else:
            cleaned[k] = v
    return cleaned

# --- Pydantic Data Models ---
class TaskCreate(BaseModel):
    title: str
    status: str = "todo"
    assignee: str = "Unassigned"
    priority: str = "medium"
    linked_files: List[str] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    priority: Optional[str] = None
    linked_files: Optional[List[str]] = None

class EventCreate(BaseModel):
    title: str
    description: str = ""
    event_date: str
    category: str = "Meeting"
    linked_files: List[str] = []

class WorkDoneCreate(BaseModel):
    task_id: Optional[str] = None
    title: str
    notes: str = ""
    completed_by: str = "User"
    user_email: Optional[str] = None
    linked_files: List[str] = []

class UserRoleUpdate(BaseModel):
    role: str  # "spectator", "employee", "admin"
    status: Optional[str] = "active"  # "active", "suspended"

class UserSync(BaseModel):
    uid: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

class ChatSessionCreate(BaseModel):
    title: Optional[str] = "New Conversation"

class ChatRequest(BaseModel):
    mode: str  # "temporary" or "context"
    message: str
    session_id: Optional[str] = "default"

# ----------------- CHAT SESSIONS & CONVERSATION MANAGEMENT -----------------
@app.get("/api/chat/sessions")
def list_chat_sessions():
    db = get_database()
    sessions = list(db.chat_sessions.find({}, {"_id": 0}).sort("updated_at", -1))
    if not sessions:
        default_sess = {
            "id": "default",
            "title": "General Planning",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        db.chat_sessions.insert_one(default_sess)
        return [default_sess]
    return sessions

@app.post("/api/chat/sessions")
def create_chat_session(payload: ChatSessionCreate):
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()
    new_session = {
        "id": str(uuid.uuid4())[:8],
        "title": payload.title or "New Conversation",
        "created_at": now_iso,
        "updated_at": now_iso
    }
    db.chat_sessions.insert_one(new_session)
    record_event("chat_session", new_session["id"], "create", None, new_session, f"Created chat '{new_session['title']}'")
    return {k: v for k, v in new_session.items() if k != "_id"}

@app.delete("/api/chat/sessions/{session_id}")
def delete_chat_session(session_id: str):
    db = get_database()
    existing = db.chat_sessions.find_one({"id": session_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    # Delete session and its messages
    db.chat_sessions.delete_one({"id": session_id})
    db.chat_messages.delete_many({"session_id": session_id})
    record_event("chat_session", session_id, "delete", clean_doc(existing), None, f"Deleted chat '{existing.get('title')}'")
    return {"status": "deleted", "session_id": session_id}

@app.get("/api/chat/sessions/{session_id}/messages")
def get_session_messages(session_id: str):
    db = get_database()
    messages = list(db.chat_messages.find({"session_id": session_id, "mode": "context"}, {"_id": 0}).sort("timestamp", 1))
    return messages

# ----------------- KANBAN / TASKS -----------------
@app.get("/api/tasks")
def list_tasks():
    db = get_database()
    tasks = list(db.tasks.find({}, {"_id": 0}))
    return tasks

@app.post("/api/tasks")
def create_task(task: TaskCreate):
    db = get_database()
    new_task = task.model_dump()
    new_task["id"] = str(uuid.uuid4())[:8]
    new_task["created_at"] = datetime.now(timezone.utc).isoformat()
    db.tasks.insert_one(new_task)
    record_event("task", new_task["id"], "create", None, new_task, f"Created task '{new_task['title']}'")
    return {k: v for k, v in new_task.items() if k != "_id"}

@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, updates: TaskUpdate):
    db = get_database()
    existing = db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    clean_updates = {k: v for k, v in updates.model_dump().items() if v is not None}
    db.tasks.update_one({"id": task_id}, {"$set": clean_updates})
    updated = {**existing, **clean_updates}
    
    action = "move" if "status" in clean_updates else ("assign" if "assignee" in clean_updates else "update")
    record_event("task", task_id, action, existing, updated, f"Updated task '{existing['title']}' ({action})")
    
    if clean_updates.get("status") == "done" and existing.get("status") != "done":
        wd = {
            "id": str(uuid.uuid4())[:8],
            "task_id": task_id,
            "title": existing["title"],
            "notes": "Task completed on Kanban",
            "completed_by": clean_updates.get("assignee") or existing.get("assignee", "User"),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "linked_files": existing.get("linked_files", [])
        }
        db.work_done.insert_one(wd)
        record_event("work_done", wd["id"], "create", None, wd, f"Completed: {wd['title']}")
        
    return updated

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    db = get_database()
    existing = db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    db.tasks.delete_one({"id": task_id})
    record_event("task", task_id, "delete", existing, None, f"Deleted task '{existing['title']}'")
    return {"status": "deleted", "id": task_id}

# ----------------- EVENTS TRACKER -----------------
@app.get("/api/events")
def list_events():
    db = get_database()
    return list(db.events.find({}, {"_id": 0}).sort("event_date", -1))

@app.post("/api/events")
def create_event(event: EventCreate):
    db = get_database()
    new_ev = event.model_dump()
    new_ev["id"] = str(uuid.uuid4())[:8]
    new_ev["created_at"] = datetime.now(timezone.utc).isoformat()
    db.events.insert_one(new_ev)
    record_event("event", new_ev["id"], "create", None, new_ev, f"Logged event '{new_ev['title']}'")
    return {k: v for k, v in new_ev.items() if k != "_id"}

# ----------------- USER MANAGEMENT & ROLE-BASED ACCESS CONTROL -----------------
@app.post("/api/users/sync")
def sync_user(payload: UserSync):
    db = get_database()
    email_clean = payload.email.lower().strip()
    existing = db.users.find_one({"email": email_clean})

    # The owner/creator is automatically the Super Admin
    is_owner = email_clean in ["goparajukarthik2@gmail.com", "admin@workos.local"]

    if not existing:
        user_doc = {
            "uid": payload.uid,
            "email": email_clean,
            "display_name": payload.display_name or email_clean.split("@")[0],
            "photo_url": payload.photo_url or "",
            "role": "admin" if is_owner else "spectator", # Default registered accounts are Spectators
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": datetime.now(timezone.utc).isoformat()
        }
        db.users.insert_one(user_doc)
        return {k: v for k, v in user_doc.items() if k != "_id"}
    else:
        # Update login time and sync profile
        update_fields = {
            "last_login": datetime.now(timezone.utc).isoformat(),
            "photo_url": payload.photo_url or existing.get("photo_url", "")
        }
        if is_owner:
            update_fields["role"] = "admin"
        db.users.update_one({"email": email_clean}, {"$set": update_fields})
        updated = db.users.find_one({"email": email_clean})
        return {k: v for k, v in updated.items() if k != "_id"}

@app.get("/api/users")
def list_users(requester_email: Optional[str] = None):
    db = get_database()
    # Check if requester is admin
    if requester_email:
        req_user = db.users.find_one({"email": requester_email.lower().strip()})
        if not req_user or req_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required to view user directory.")
    
    users = list(db.users.find({}, {"_id": 0}).sort("created_at", -1))
    return users

@app.put("/api/users/{target_email}/role")
def update_user_role(target_email: str, update: UserRoleUpdate, requester_email: str):
    db = get_database()
    req_user = db.users.find_one({"email": requester_email.lower().strip()})
    if not req_user or req_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can alter user roles or account status.")

    target_clean = target_email.lower().strip()
    valid_roles = ["spectator", "employee", "admin"]
    if update.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role. Must be spectator, employee, or admin.")

    result = db.users.update_one(
        {"email": target_clean},
        {"$set": {"role": update.role, "status": update.status or "active"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Target user not found.")

    record_event("user_role", target_clean, "update", None, {"role": update.role, "status": update.status}, f"Admin changed role of {target_clean} to {update.role.upper()}")
    return {"status": "success", "email": target_clean, "role": update.role, "account_status": update.status}

# ----------------- WORK DONE TRACKER (ROLE FILTERED) -----------------
@app.get("/api/work-done")
def list_work_done(user_email: Optional[str] = None, role: Optional[str] = "spectator"):
    db = get_database()
    # Admin sees everything; Employee or Spectator only sees work logged by themselves
    if role == "admin":
        return list(db.work_done.find({}, {"_id": 0}).sort("completed_at", -1))
    
    if user_email:
        email_clean = user_email.lower().strip()
        return list(db.work_done.find({
            "$or": [
                {"user_email": email_clean},
                {"completed_by": {"$regex": email_clean.split("@")[0], "$options": "i"}}
            ]
        }, {"_id": 0}).sort("completed_at", -1))
    
    return []

@app.post("/api/work-done")
def create_work_done(item: WorkDoneCreate):
    db = get_database()
    new_wd = item.model_dump()
    new_wd["id"] = str(uuid.uuid4())[:8]
    new_wd["completed_at"] = datetime.now(timezone.utc).isoformat()
    db.work_done.insert_one(new_wd)
    record_event("work_done", new_wd["id"], "create", None, new_wd, f"Recorded work done: '{new_wd['title']}'")
    return {k: v for k, v in new_wd.items() if k != "_id"}

# ----------------- UNIVERSAL TIMELINE -----------------
@app.get("/api/timeline")
def get_timeline():
    db = get_database()
    raw = list(db.timeline.find({}).sort("timestamp", -1).limit(50))
    return [clean_doc(x) for x in raw]

@app.post("/api/timeline/{timeline_id}/revert")
def revert_timeline_action(timeline_id: str):
    try:
        success = revert_action(timeline_id)
        return {"status": "reverted", "timeline_id": timeline_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ----------------- AI FILE SYSTEM, OCR & VECTOR SEARCH -----------------
@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    linked_type: Optional[str] = Form(None),
    linked_id: Optional[str] = Form(None)
):
    db = get_database()
    file_id = str(uuid.uuid4())[:8]
    safe_filename = f"{file_id}_{file.filename}"
    save_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    extracted_text = extract_text_from_file(save_path, file.filename)
    summary = generate_summary(extracted_text, file.filename)

    file_doc = {
        "id": file_id,
        "original_filename": file.filename,
        "saved_filename": safe_filename,
        "file_path": f"/static/uploads/{safe_filename}",
        "mime_type": file.content_type,
        "extracted_text": extracted_text,
        "summary": summary,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "file_size": os.path.getsize(save_path),
        "linked_entity": {"type": linked_type, "id": linked_id} if linked_type and linked_id else None
    }

    db.files.insert_one(file_doc)
    record_event("file", file_id, "create", None, file_doc, f"Uploaded & indexed file '{file.filename}'")

    index_content = f"{file.filename}\nSummary: {summary}\nContent: {extracted_text[:1000]}"
    vector_manager.add_document(
        doc_id=file_id,
        text=index_content,
        meta={"filename": file.filename, "file_id": file_id, "summary": summary}
    )

    # Bi-directional linking: If uploaded from a task or work-done item, link file directly to it
    if linked_type and linked_id:
        file_path_ref = file_doc["file_path"]
        if linked_type == "task":
            db.tasks.update_one({"id": linked_id}, {"$addToSet": {"linked_files": file_path_ref}})
        elif linked_type == "work_done":
            db.work_done.update_one({"id": linked_id}, {"$addToSet": {"linked_files": file_path_ref}})
        elif linked_type == "event":
            db.events.update_one({"id": linked_id}, {"$addToSet": {"linked_files": file_path_ref}})

    return {k: v for k, v in file_doc.items() if k != "_id"}

@app.get("/api/files")
def list_files(search: Optional[str] = Query(None)):
    db = get_database()
    if search:
        faiss_results = vector_manager.search(search, top_k=10)
        file_ids = [r["id"] for r in faiss_results]
        files = list(db.files.find({"id": {"$in": file_ids}}, {"_id": 0}))
        order_map = {fid: idx for idx, fid in enumerate(file_ids)}
        files.sort(key=lambda x: order_map.get(x["id"], 999))
        return files
    
    return list(db.files.find({}, {"_id": 0}).sort("uploaded_at", -1))

# ----------------- DUAL-MODE AI CHAT -----------------
@app.get("/api/chat/history")
def get_chat_history(session_id: str = Query("default")):
    db = get_database()
    return list(db.chat_messages.find({"session_id": session_id, "mode": "context"}, {"_id": 0}).sort("timestamp", 1))

@app.post("/api/chat")
def handle_chat(req: ChatRequest):
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()
    session_id = req.session_id or "default"

    if req.mode == "temporary":
        result = execute_temporary_command(req.message)
        return {
            "mode": "temporary",
            "user_message": req.message,
            "response": result["message"],
            "command_result": result,
            "tts_audio_url": None
        }

    else:
        # Context mode: store in session
        user_msg = {
            "id": str(uuid.uuid4())[:8],
            "session_id": session_id,
            "role": "user",
            "content": req.message,
            "timestamp": now_iso,
            "mode": "context"
        }
        db.chat_messages.insert_one(user_msg)

        ai_out = query_context_assistant(req.message)
        
        tts_filename = tts_service.speak_to_file(ai_out["reply"])
        tts_url = f"/static/tts/{tts_filename}" if tts_filename else None

        bot_msg = {
            "id": str(uuid.uuid4())[:8],
            "session_id": session_id,
            "role": "assistant",
            "content": ai_out["reply"],
            "sources": ai_out.get("sources", []),
            "tts_audio_url": tts_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mode": "context"
        }
        db.chat_messages.insert_one(bot_msg)

        # Update session title if first message
        db.chat_sessions.update_one(
            {"id": session_id},
            {"$set": {"updated_at": now_iso}}
        )

        return {
            "mode": "context",
            "session_id": session_id,
            "user_message": req.message,
            "response": ai_out["reply"],
            "sources": ai_out.get("sources", []),
            "tts_audio_url": tts_url
        }

# ----------------- RECORD EXTERNAL / CLIENT-GENERATED MESSAGE -----------------
class ClientMessageSave(BaseModel):
    session_id: str
    user_prompt: str
    assistant_reply: str
    sources: List[str] = []

@app.post("/api/chat/save-turn")
def save_chat_turn(payload: ClientMessageSave):
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()

    user_msg = {
        "id": str(uuid.uuid4())[:8],
        "session_id": payload.session_id,
        "role": "user",
        "content": payload.user_prompt,
        "timestamp": now_iso,
        "mode": "context"
      }
    bot_msg = {
        "id": str(uuid.uuid4())[:8],
        "session_id": payload.session_id,
        "role": "assistant",
        "content": payload.assistant_reply,
        "sources": payload.sources,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mode": "context"
    }
    db.chat_messages.insert_many([user_msg, bot_msg])
    
    # Auto-title session if it's "New Conversation"
    sess = db.chat_sessions.find_one({"id": payload.session_id})
    if sess and sess.get("title") in ["New Conversation", "New Chat"]:
        title_snippet = payload.user_prompt[:28].strip()
        db.chat_sessions.update_one({"id": payload.session_id}, {"$set": {"title": title_snippet, "updated_at": now_iso}})

    return {"status": "saved"}

# ----------------- LIGHTWEIGHT ON-DEVICE TTS DIRECT ENDPOINT -----------------
@app.post("/api/tts")
def generate_tts(text: str = Form(...)):
    filename = tts_service.speak_to_file(text)
    if not filename:
        raise HTTPException(status_code=500, detail="TTS generation failed")
    return {"audio_url": f"/static/tts/{filename}"}

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Local AI Work OS", "version": "1.0.0"}
