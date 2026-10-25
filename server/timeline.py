from datetime import datetime, timezone
import uuid
from database import get_database

def serialize_state(state: dict):
    if not state or not isinstance(state, dict):
        return state
    clean = {}
    for k, v in state.items():
        if k == "_id":
            continue
        clean[k] = v
    return clean

def record_event(entity_type: str, entity_id: str, action: str, previous_state: dict = None, new_state: dict = None, description: str = ""):
    """
    Appends an immutable state-transition log to the universal timeline.
    Enables instant undo / reversibility across any task, event, chat, or file.
    """
    db = get_database()
    timeline_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entity_type": entity_type,  # e.g., 'task', 'event', 'work_done', 'file', 'chat_message'
        "entity_id": str(entity_id),
        "action": action,            # 'create', 'update', 'delete', 'move', 'assign'
        "previous_state": serialize_state(previous_state),
        "new_state": serialize_state(new_state),
        "description": description,
        "is_reverted": False
    }
    db.timeline.insert_one(timeline_entry)
    return timeline_entry

def revert_action(timeline_id: str):
    """
    Reverts a specific action by restoring previous_state or marking deleted/restored.
    """
    db = get_database()
    entry = db.timeline.find_one({"id": timeline_id})
    if not entry:
        raise ValueError("Timeline entry not found")
    
    if entry.get("is_reverted"):
        raise ValueError("This action has already been reverted")

    entity_type = entry["entity_type"]
    entity_id = entry["entity_id"]
    prev_state = entry.get("previous_state")
    action = entry.get("action")

    target_coll = None
    if entity_type == "task":
        target_coll = db.tasks
    elif entity_type == "event":
        target_coll = db.events
    elif entity_type == "work_done":
        target_coll = db.work_done
    elif entity_type == "file":
        target_coll = db.files
    elif entity_type == "chat_message":
        target_coll = db.chat_messages

    if target_coll is not None:
        if action == "create":
            # Reverting a creation deletes or marks deleted
            target_coll.delete_one({"id": entity_id})
        elif action in ["update", "move", "assign"]:
            if prev_state:
                clean_prev = {k: v for k, v in prev_state.items() if k != "_id"}
                target_coll.update_one({"id": entity_id}, {"$set": clean_prev})
        elif action == "delete":
            if prev_state:
                clean_prev = {k: v for k, v in prev_state.items() if k != "_id"}
                target_coll.insert_one(clean_prev)

    db.timeline.update_one({"id": timeline_id}, {"$set": {"is_reverted": True}})
    
    # Record the reversal itself in the universal timeline
    record_event(
        entity_type=entity_type,
        entity_id=entity_id,
        action="revert",
        previous_state=entry.get("new_state"),
        new_state=prev_state,
        description=f"Reverted action {action} on {entity_type} {entity_id}"
    )
    return True
