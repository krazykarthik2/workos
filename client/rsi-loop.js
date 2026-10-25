import { EVALUATION_DATASET, robustParseToon, evaluatePredictions } from './src/benchmark.js';

// Recursive Self Improvement Sandbox for Query Resolution & Semantic Disambiguation
export function refineQueryToToolIntent(userQuery, rawLlmToon) {
  let parsed = robustParseToon(rawLlmToon);
  const q = (userQuery || "").toLowerCase();

  // If LLM returned empty or generic "all" when user asked specific query
  if (!parsed || !parsed.tool || (parsed.tool === 'get_tasks' && parsed.status === 'all')) {
    // Semantic Intent Extraction
    if (q.includes("urgent") || q.includes("urgently") || q.includes("asap") || q.includes("priority")) {
      return { tool: "get_tasks", status: "todo", priority: "high" };
    }
    if (q.includes("progress") || q.includes("doing") || q.includes("active") || q.includes("current")) {
      return { tool: "get_tasks", status: "doing" };
    }
    if (q.includes("todo") || q.includes("to do") || q.includes("pending") || q.includes("should do") || q.includes("need to do")) {
      return { tool: "get_tasks", status: "todo" };
    }
    if (q.includes("done") || q.includes("finished") || q.includes("completed")) {
      return { tool: "get_tasks", status: "done" };
    }
  }

  // If user asked "what are the tasks that i should do urgently", but LLM forgot status: todo
  if (parsed && parsed.tool === 'get_tasks') {
    if ((q.includes("should do") || q.includes("need to do") || q.includes("urgent")) && !parsed.status) {
      parsed.status = "todo";
    }
    if ((q.includes("urgent") || q.includes("urgently") || q.includes("high priority")) && !parsed.priority) {
      parsed.priority = "high";
    }
  }

  return parsed || { tool: "get_tasks", status: "all" };
}

// Format accurate, concise, human-natural language response based on matching tasks
export function generateNaturalLanguageResponse(userQuery, toolData, tasksFound) {
  const q = (userQuery || "").toLowerCase();

  if (!tasksFound || tasksFound.length === 0) {
    if (toolData.priority === 'high' || q.includes("urgent")) {
      return "You have no urgent tasks pending in your to-do list right now.";
    }
    if (toolData.status === 'doing' || q.includes("progress")) {
      return "There are no tasks currently in progress.";
    }
    if (toolData.status === 'todo') {
      return "You have no pending tasks on your to-do board.";
    }
    return "No matching tasks found for your request.";
  }

  // Specific format for urgent / todo tasks
  if (toolData.priority === 'high' || q.includes("urgent")) {
    if (tasksFound.length === 1) {
      const t = tasksFound[0];
      return `You have 1 urgent task that needs attention: "${t.title}" (assigned to ${t.assignee || 'Unassigned'}).`;
    }
    const taskList = tasksFound.map(t => `"${t.title}" (assigned to ${t.assignee || 'Unassigned'})`).join(', ');
    return `Here are the urgent tasks you should tackle first: ${taskList}.`;
  }

  // Specific format for in-progress tasks
  if (toolData.status === 'doing' || q.includes("progress")) {
    const taskList = tasksFound.map(t => `"${t.title}" (${t.assignee || 'Unassigned'})`).join(', ');
    return `Currently in progress: ${taskList}.`;
  }

  // General todo
  const taskList = tasksFound.map(t => `"${t.title}"`).join(', ');
  return `You have ${tasksFound.length} task(s) to do: ${taskList}.`;
}

// Test Suite
console.log("=== RUNNING RSI RECURSIVE IMPROVEMENT LOOP FOR TARGET INTENTS ===");

const simulatedDbTasks = [
  { id: "1", title: "Deploy Gemma 3 Local SLM Pipeline", status: "done", priority: "high", assignee: "Alex" },
  { id: "2", title: "Configure FAISS Vector Knowledge Base", status: "doing", priority: "high", assignee: "Karthik" },
  { id: "3", title: "Prepare Q3 Board Strategy Brief", status: "todo", priority: "high", assignee: "Sarah" },
  { id: "4", title: "run test verification", status: "todo", priority: "medium", assignee: "Unassigned" }
];

// Test 1: User asks urgent tasks (should only return "Prepare Q3 Board Strategy Brief")
const query1 = "what are the tasks that i should do urgently";
// Simulate an SLM that returned generic all tasks
const rawLlm1 = "tool: get_tasks\nstatus: all";
const refined1 = refineQueryToToolIntent(query1, rawLlm1);
console.log("Refined Tool Intent 1:", refined1);

const filtered1 = simulatedDbTasks.filter(t => 
  (refined1.status ? t.status === refined1.status : true) &&
  (refined1.priority ? t.priority === refined1.priority : true)
);

const naturalAnswer1 = generateNaturalLanguageResponse(query1, refined1, filtered1);
console.log("\nNatural Answer 1:\n", naturalAnswer1);

if (naturalAnswer1.includes("Deploy Gemma") || naturalAnswer1.includes("Configure FAISS")) {
  console.error("FAIL: included non-todo or non-urgent tasks!");
  process.exit(1);
} else {
  console.log("\nPASS: Only targeted todo urgent task was included!");
}
