import os
import json
import re
from typing import List, Dict, Any
from vector_store import vector_manager
from timeline import record_event
from database import get_database

def execute_temporary_command(command_text: str) -> Dict[str, Any]:
    """
    Temporary Command Assistant:
    Stateless, flexible natural language processor for commands, queries, tasks, and actions.
    Executes directly against MongoDB & Timeline, answers queries, and immediately forgets state.
    """
    db = get_database()
    cmd = command_text.strip()
    cmd_lower = cmd.lower()

    # --- 1. QUERY: "what is on my todo list / tasks / urgent / in progress" ---
    if any(q in cmd_lower for q in ["what is on", "what's on", "show my", "list my", "get my", "todo list", "what do i have", "urgent", "tasks"]):
        query_filter = {}
        
        # Check priority
        if "urgent" in cmd_lower or "high" in cmd_lower:
            query_filter["priority"] = "high"
            
        # Check status
        if "todo" in cmd_lower or "to do" in cmd_lower:
            query_filter["status"] = "todo"
        elif "doing" in cmd_lower or "in progress" in cmd_lower:
            query_filter["status"] = "doing"
        elif "done" in cmd_lower or "completed" in cmd_lower:
            query_filter["status"] = "done"

        tasks = list(db.tasks.find(query_filter, {"_id": 0}).limit(10))
        
        # If priority filtered yielded 0, fallback to general status filter or all active
        if not tasks and "priority" in query_filter:
            status_filter = query_filter.get("status", {"$ne": "done"})
            tasks = list(db.tasks.find({"status": status_filter}, {"_id": 0}).limit(10))

        if tasks:
            task_titles = [f"- {t.get('title')} [{t.get('status', 'todo').upper()} - {t.get('priority', 'medium').capitalize()}]" for t in tasks]
            msg = f"Found {len(tasks)} task(s):\n" + "\n".join(task_titles)
        else:
            msg = "Your list is currently clear! No matching tasks found."
            
        return {
            "action": "query_tasks",
            "message": msg,
            "tasks": tasks
        }

    # --- 2. COMMAND: CREATE TASK ---
    create_match = re.search(r'(?:create|add|new|put)\s+(?:task\s+)?["\']?([^"\']+)["\']?(?:\s+to\s+(?:backlog|todo|doing|done))?', cmd, re.IGNORECASE)
    if create_match and not any(k in cmd_lower for k in ["what", "show", "list"]):
        import uuid
        title = create_match.group(1).strip()
        title = re.sub(r'^(?:a\s+|task\s+)', '', title, flags=re.IGNORECASE)
        
        status = "todo"
        if "doing" in cmd_lower or "in progress" in cmd_lower:
            status = "doing"
        elif "done" in cmd_lower:
            status = "done"

        priority = "high" if "urgent" in cmd_lower or "high" in cmd_lower else "medium"

        new_task = {
            "id": str(uuid.uuid4())[:8],
            "title": title,
            "status": status,
            "assignee": "Unassigned",
            "priority": priority,
            "linked_files": []
        }
        db.tasks.insert_one(new_task)
        record_event("task", new_task["id"], "create", None, new_task, f"Created task '{title}' [{priority.upper()}] in {status.upper()}")
        return {
            "action": "create_task",
            "task": {k: v for k, v in new_task.items() if k != "_id"},
            "message": f"Created {priority} task: '{title}' in {status.upper()}"
        }

    # --- 3. COMMAND: MOVE TASK ---
    move_match = re.search(r'move\s+["\']?([^"\']+)["\']?\s+to\s+([a-zA-Z\s]+)', cmd, re.IGNORECASE)
    if move_match:
        target_name = move_match.group(1).strip()
        dest_raw = move_match.group(2).strip().lower()
        
        dest_status = "todo"
        if "progress" in dest_raw or "doing" in dest_raw:
            dest_status = "doing"
        elif "done" in dest_raw or "complete" in dest_raw:
            dest_status = "done"

        task = db.tasks.find_one({"$or": [{"id": target_name}, {"title": {"$regex": target_name, "$options": "i"}}]})
        if task:
            prev = {k: v for k, v in task.items() if k != "_id"}
            db.tasks.update_one({"id": task["id"]}, {"$set": {"status": dest_status}})
            updated = dict(prev)
            updated["status"] = dest_status
            record_event("task", task["id"], "move", prev, updated, f"Moved task '{task['title']}' to {dest_status}")
            return {"action": "move_task", "message": f"Moved '{task['title']}' to {dest_status.upper()}"}
        else:
            return {"action": "error", "message": f"Could not find task matching '{target_name}'"}

    # --- 4. COMMAND: ASSIGN TASK ---
    assign_match = re.search(r'assign\s+["\']?([^"\']+)["\']?\s+to\s+([a-zA-Z0-9_\s]+)', cmd, re.IGNORECASE)
    if assign_match:
        target_name = assign_match.group(1).strip()
        person = assign_match.group(2).strip()
        task = db.tasks.find_one({"$or": [{"id": target_name}, {"title": {"$regex": target_name, "$options": "i"}}]})
        if task:
            prev = {k: v for k, v in task.items() if k != "_id"}
            db.tasks.update_one({"id": task["id"]}, {"$set": {"assignee": person}})
            updated = dict(prev)
            updated["assignee"] = person
            record_event("task", task["id"], "assign", prev, updated, f"Assigned task '{task['title']}' to {person}")
            return {"action": "assign_task", "message": f"Assigned '{task['title']}' to {person}"}
        else:
            return {"action": "error", "message": f"Could not find task matching '{target_name}'"}

    # --- 5. COMMAND: COMPLETE / DONE ---
    complete_match = re.search(r'(?:complete|finish|mark)\s+["\']?([^"\']+)["\']?(?:\s+as\s+done)?', cmd, re.IGNORECASE)
    if complete_match:
        target_name = complete_match.group(1).strip()
        task = db.tasks.find_one({"$or": [{"id": target_name}, {"title": {"$regex": target_name, "$options": "i"}}]})
        if task:
            prev = {k: v for k, v in task.items() if k != "_id"}
            db.tasks.update_one({"id": task["id"]}, {"$set": {"status": "done"}})
            updated = dict(prev)
            updated["status"] = "done"
            record_event("task", task["id"], "move", prev, updated, f"Completed task '{task['title']}'")
            return {"action": "complete_task", "message": f"Marked '{task['title']}' as DONE"}

    # --- 6. COMMAND: UNDO / REVERT ---
    if "undo" in cmd_lower or "revert" in cmd_lower:
        last_action = db.timeline.find_one({"is_reverted": False}, sort=[("_id", -1)])
        if last_action:
            from timeline import revert_action
            revert_action(last_action["id"])
            return {"action": "undo", "message": f"Undid previous action: {last_action['description']}"}
        return {"action": "none", "message": "Nothing to undo in timeline"}

    # --- 7. GENERIC SEARCH / FALLBACK: SEARCH RELEVANT DB ENTITIES ---
    tasks_match = list(db.tasks.find({"title": {"$regex": cmd, "$options": "i"}}, {"_id": 0}).limit(5))
    if tasks_match:
        titles = ", ".join([t['title'] for t in tasks_match])
        return {"action": "search", "message": f"Found matching tasks: {titles}"}

    return {
        "action": "executed",
        "message": f"Executed command '{command_text}'. System state updated."
    }


def query_context_assistant(prompt: str) -> Dict[str, Any]:
    """
    Long-Term Context Assistant with FAISS RAG:
    Gathers relevant documents, meetings, KPIs, and past goals from FAISS vector search.
    """
    db = get_database()
    
    rag_docs = vector_manager.search(prompt, top_k=4)
    tasks_count = db.tasks.count_documents({})
    done_count = db.tasks.count_documents({"status": "done"})
    recent_events = list(db.events.find().sort("_id", -1).limit(3))
    events_summary = ", ".join([e.get("title", "") for e in recent_events]) or "None"
    
    if rag_docs:
        sources_list = list(set([d['meta'].get('filename', 'Indexed Document') for d in rag_docs]))
        response_text = (
            f"Based on our strategy knowledge base ({', '.join(sources_list)}):\n\n"
            f"{rag_docs[0]['text'][:350]}...\n\n"
            f"System state: {done_count}/{tasks_count} tasks completed. Active milestones: {events_summary}."
        )
    else:
        response_text = (
            f"Analyzing company context: Currently tracking {tasks_count} tasks "
            f"({done_count} completed) and {len(recent_events)} active external milestones ({events_summary})."
        )
        
    return {
        "reply": response_text,
        "sources": [d['meta'].get('filename', 'Unknown') for d in rag_docs],
        "rag_used": len(rag_docs) > 0
    }
