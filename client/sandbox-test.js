/**
 * Comprehensive Sandbox Test
 * Tests intent detection, LLM output parsing, and tool routing
 * for the Work OS ReAct agent pipeline.
 *
 * Run: node --experimental-vm-modules client/sandbox-test.js
 * (Or via: npx tsx client/sandbox-test.js)
 */

// Since this is a Node.js test script and the project uses ESM with @toon-format/toon,
// we inline the logic to avoid import issues in Node without bundler.

// ============================================================
// Inline copies of intent-detection.js functions for Node testing
// (The actual app uses the shared module via imports)
// ============================================================

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"
];

const MONTH_REGEX = new RegExp(`\\b(${MONTH_NAMES.join("|")})\\b`, "i");

const MONTH_ABBREV_MAP = {
  jan: "january", feb: "february", mar: "march", apr: "april",
  jun: "june", jul: "july", aug: "august", sep: "september",
  oct: "october", nov: "november", dec: "december"
};

function normalizeMonth(m) {
  if (!m) return "";
  const lower = m.toLowerCase();
  return MONTH_ABBREV_MAP[lower] || lower;
}

function detectIntentFromQuery(userQuery) {
  const q = userQuery.toLowerCase();

  // --- Files (check BEFORE events: "search for meeting notes" is file search, not event) ---
  const fileKeywords = [
    "file", "document", "pdf", "notes", "report",
    "doc", "presentation", "spreadsheet", "find the"
  ];
  const hasFileKeyword = fileKeywords.some(kw => q.includes(kw));
  const hasSearchPrefix = q.includes("search");
  if (hasSearchPrefix && hasFileKeyword) {
    return { tool: "search_files", query: userQuery };
  }

  const eventKeywords = [
    "event", "meeting", "summit", "conference", "calendar",
    "schedule", "upcoming", "announcement", "keynote",
    "what's on", "whats on", "any conferences", "any events"
  ];
  const hasEventKeyword = eventKeywords.some(kw => q.includes(kw));

  const monthMatch = q.match(MONTH_REGEX);
  const mentionsTask = q.includes("task");

  if (hasEventKeyword || (monthMatch && !mentionsTask)) {
    return {
      tool: "get_events",
      month: monthMatch ? normalizeMonth(monthMatch[1]) : ""
    };
  }

  const workKeywords = [
    "work log", "work done", "deliverable", "proof of work",
    "accomplished", "completed work", "milestone", "delivered",
    "achievement", "what did i deliver", "what did the team",
    "what has been accomplished", "what was delivered", "work was logged"
  ];
  if (workKeywords.some(kw => q.includes(kw))) {
    return { tool: "get_work_done" };
  }

  // --- Files (standalone, no "search" prefix required) ---
  if (hasFileKeyword || hasSearchPrefix) {
    return { tool: "search_files", query: userQuery };
  }

  return { tool: "get_tasks", status: "all" };
}

function parseLLMOutput(rawText) {
  if (!rawText) return null;

  let textToParse = rawText;
  const actionMatch = rawText.match(/Action:\s*([\s\S]*)/i);
  if (actionMatch) {
    textToParse = actionMatch[1].trim();
  }

  // Skip TOON decode in Node (no @toon-format/toon), go straight to regex
  const toolMatch = textToParse.match(/tool:\s*([a-zA-Z0-9_-]+)/i);
  if (toolMatch) {
    const obj = { tool: toolMatch[1].trim() };
    const lines = textToParse.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim().toLowerCase();
        let val = line.slice(idx + 1).trim();
        val = val.replace(/^["'](.*?)["']$/, '$1');
        if (key && key !== 'tool' && key !== 'thought' && key !== 'action' && val) {
          obj[key] = val;
        }
      }
    }
    return obj;
  }

  if (actionMatch) {
    const toolMatchFull = rawText.match(/tool:\s*([a-zA-Z0-9_-]+)/i);
    if (toolMatchFull) {
      const obj = { tool: toolMatchFull[1].trim() };
      const lines = rawText.split('\n');
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx !== -1) {
          const key = line.slice(0, idx).trim().toLowerCase();
          let val = line.slice(idx + 1).trim();
          val = val.replace(/^["'](.*?)["']$/, '$1');
          if (key && key !== 'tool' && key !== 'thought' && key !== 'action' && val) {
            obj[key] = val;
          }
        }
      }
      return obj;
    }
  }

  return null;
}

function refineToolData(toolData, userQuery) {
  if (!toolData || !toolData.tool) return toolData;

  const q = userQuery.toLowerCase();
  const tool = toolData.tool.toLowerCase().trim();
  const refined = { ...toolData, tool };

  if (tool === "get_events" && !refined.month) {
    const monthMatch = q.match(MONTH_REGEX);
    if (monthMatch) {
      refined.month = normalizeMonth(monthMatch[1]);
    }
  }

  if (tool === "search_files" && !refined.query) {
    refined.query = userQuery;
  }

  if (tool === "get_tasks" && !refined.status) {
    refined.status = "all";
  }

  return refined;
}

// ============================================================
// Test Harness
// ============================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.log(`  ❌ FAIL: ${testName}${details ? ` — ${details}` : ""}`);
    failures.push({ testName, details });
  }
}

// ============================================================
// Test Suite 1: detectIntentFromQuery
// ============================================================

console.log("\n" + "=".repeat(60));
console.log("TEST SUITE 1: detectIntentFromQuery (Keyword Fallback)");
console.log("=".repeat(60));

const intentTests = [
  // Events
  { query: "any events in november", expectedTool: "get_events", checkMonth: "november" },
  { query: "upcoming meetings", expectedTool: "get_events" },
  { query: "what's on the calendar", expectedTool: "get_events" },
  { query: "any conferences this month", expectedTool: "get_events" },
  { query: "are there any meetings this week", expectedTool: "get_events" },
  { query: "any announcements or conferences coming up", expectedTool: "get_events" },
  { query: "what's on the schedule for october", expectedTool: "get_events", checkMonth: "october" },
  { query: "events in dec", expectedTool: "get_events", checkMonth: "december" },
  { query: "is there a keynote soon", expectedTool: "get_events" },
  { query: "any summit happening in january", expectedTool: "get_events", checkMonth: "january" },
  // Month name alone (no explicit event keyword, but month present → events)
  { query: "anything in november", expectedTool: "get_events", checkMonth: "november" },

  // Work done
  { query: "what is my work log", expectedTool: "get_work_done" },
  { query: "what did I deliver", expectedTool: "get_work_done" },
  { query: "show completed work", expectedTool: "get_work_done" },
  { query: "what has been accomplished", expectedTool: "get_work_done" },
  { query: "what did the team accomplish", expectedTool: "get_work_done" },
  { query: "show me completed milestones", expectedTool: "get_work_done" },
  { query: "what was delivered this sprint", expectedTool: "get_work_done" },

  // Files
  { query: "find the quarterly report", expectedTool: "search_files" },
  { query: "search for meeting notes", expectedTool: "search_files" },
  { query: "find the budget spreadsheet", expectedTool: "search_files" },
  { query: "look up the presentation doc", expectedTool: "search_files" },

  // Tasks (default)
  { query: "what tasks are in progress", expectedTool: "get_tasks" },
  { query: "list all tasks", expectedTool: "get_tasks" },
  { query: "what should I work on", expectedTool: "get_tasks" },
];

for (const t of intentTests) {
  const result = detectIntentFromQuery(t.query);
  assert(
    result.tool === t.expectedTool,
    `"${t.query}" → ${t.expectedTool}`,
    `got ${result.tool}`
  );
  if (t.checkMonth) {
    assert(
      result.month === t.checkMonth,
      `"${t.query}" month=${t.checkMonth}`,
      `got month=${result.month}`
    );
  }
}

// ============================================================
// Test Suite 2: parseLLMOutput (Simulated Model Outputs)
// ============================================================

console.log("\n" + "=".repeat(60));
console.log("TEST SUITE 2: parseLLMOutput (LLM Output Parsing)");
console.log("=".repeat(60));

const parseTests = [
  {
    name: "Standard Thought+Action format",
    input: `Thought: The user wants events in November.
Action:
tool: get_events
month: november`,
    expectedTool: "get_events",
    expectedParams: { month: "november" }
  },
  {
    name: "Action without Thought prefix",
    input: `tool: get_work_done`,
    expectedTool: "get_work_done",
    expectedParams: {}
  },
  {
    name: "Tool with quoted params",
    input: `Action:
tool: search_files
query: "quarterly report"`,
    expectedTool: "search_files",
    expectedParams: { query: "quarterly report" }
  },
  {
    name: "Tool with status and priority",
    input: `Thought: The user needs urgent tasks.
Action:
tool: get_tasks
status: todo
priority: high`,
    expectedTool: "get_tasks",
    expectedParams: { status: "todo", priority: "high" }
  },
  {
    name: "TOON in code block",
    input: "```toon\ntool: get_events\nmonth: december\n```",
    expectedTool: "get_events",
    expectedParams: { month: "december" }
  },
  {
    name: "Messy output with extra text before Action",
    input: `I think the user wants to see tasks.
Thought: Let me check tasks.
Action:
tool: get_tasks
status: doing`,
    expectedTool: "get_tasks",
    expectedParams: { status: "doing" }
  },
  {
    name: "Create task with multiple params",
    input: `Thought: Creating a new task.
Action:
tool: create_task
title: Fix login bug
priority: high
assignee: Sarah
status: todo`,
    expectedTool: "create_task",
    expectedParams: { title: "Fix login bug", priority: "high", assignee: "Sarah" }
  },
  {
    name: "Returns null for empty input",
    input: "",
    expectedTool: null,
    expectedParams: {}
  },
  {
    name: "Returns null for gibberish",
    input: "Hello! How are you today? I'm doing great.",
    expectedTool: null,
    expectedParams: {}
  },
  {
    name: "Assign task format",
    input: `Action:
tool: assign_task
task_title: FAISS indexing
assignee: Alex`,
    expectedTool: "assign_task",
    expectedParams: { task_title: "FAISS indexing", assignee: "Alex" }
  }
];

for (const t of parseTests) {
  const result = parseLLMOutput(t.input);
  if (t.expectedTool === null) {
    assert(result === null, t.name, `expected null, got ${JSON.stringify(result)}`);
  } else {
    assert(
      result !== null && result.tool === t.expectedTool,
      `${t.name} → tool=${t.expectedTool}`,
      `got ${result ? result.tool : "null"}`
    );
    for (const [k, v] of Object.entries(t.expectedParams)) {
      assert(
        result && result[k] === v,
        `${t.name} → ${k}=${v}`,
        `got ${k}=${result ? result[k] : "undefined"}`
      );
    }
  }
}

// ============================================================
// Test Suite 3: refineToolData (Post-processing)
// ============================================================

console.log("\n" + "=".repeat(60));
console.log("TEST SUITE 3: refineToolData (Post-processing)");
console.log("=".repeat(60));

const refineTests = [
  {
    name: "Adds month to get_events when missing",
    toolData: { tool: "get_events" },
    query: "events in november",
    check: (r) => r.month === "november"
  },
  {
    name: "Adds query to search_files when missing",
    toolData: { tool: "search_files" },
    query: "find the budget report",
    check: (r) => r.query === "find the budget report"
  },
  {
    name: "Adds status=all to get_tasks when missing",
    toolData: { tool: "get_tasks" },
    query: "list tasks",
    check: (r) => r.status === "all"
  },
  {
    name: "Does not overwrite existing month",
    toolData: { tool: "get_events", month: "december" },
    query: "events in november",
    check: (r) => r.month === "december"
  },
  {
    name: "Normalizes abbreviated month (nov → november)",
    toolData: { tool: "get_events" },
    query: "events in nov",
    check: (r) => r.month === "november"
  },
  {
    name: "Handles null toolData gracefully",
    toolData: null,
    query: "anything",
    check: (r) => r === null
  }
];

for (const t of refineTests) {
  const result = refineToolData(t.toolData, t.query);
  assert(t.check(result), t.name, `got ${JSON.stringify(result)}`);
}

// ============================================================
// Test Suite 4: End-to-End Routing (Simulated full pipeline)
// ============================================================

console.log("\n" + "=".repeat(60));
console.log("TEST SUITE 4: End-to-End Routing Pipeline");
console.log("=".repeat(60));

// Simulates: LLM output → parse → refine → fallback
function simulateRouting(llmOutput, userQuery) {
  let toolData = parseLLMOutput(llmOutput);
  if (toolData && toolData.tool) {
    toolData = refineToolData(toolData, userQuery);
  }
  if (!toolData || !toolData.tool) {
    toolData = detectIntentFromQuery(userQuery);
  }
  return toolData;
}

const e2eTests = [
  {
    name: "LLM correctly outputs get_events",
    llmOutput: "Thought: Events query.\nAction:\ntool: get_events\nmonth: november",
    query: "any events in november",
    expectedTool: "get_events"
  },
  {
    name: "LLM fails, fallback to get_events via keyword",
    llmOutput: "I'm not sure what to do here.",
    query: "upcoming meetings",
    expectedTool: "get_events"
  },
  {
    name: "LLM fails, fallback to get_work_done via keyword",
    llmOutput: "",
    query: "what is my work log",
    expectedTool: "get_work_done"
  },
  {
    name: "LLM outputs wrong tool, but parsing still returns it",
    llmOutput: "Thought: Tasks.\nAction:\ntool: get_tasks\nstatus: all",
    query: "any events in november",
    expectedTool: "get_tasks" // Parser trusts LLM output; fallback not triggered
  },
  {
    name: "LLM gives gibberish, fallback to search_files",
    llmOutput: "Sure! Here is a nice poem about flowers.",
    query: "find the quarterly report",
    expectedTool: "search_files"
  },
  {
    name: "LLM empty, default to get_tasks",
    llmOutput: "",
    query: "what should I work on today",
    expectedTool: "get_tasks"
  }
];

for (const t of e2eTests) {
  const result = simulateRouting(t.llmOutput, t.query);
  assert(
    result.tool === t.expectedTool,
    t.name,
    `expected ${t.expectedTool}, got ${result.tool}`
  );
}

// ============================================================
// Summary
// ============================================================

console.log("\n" + "=".repeat(60));
console.log("SANDBOX TEST RESULTS");
console.log("=".repeat(60));
const score = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
console.log(`Total:  ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Score:  ${score}%`);

if (failures.length > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) {
    console.log(`  - ${f.testName}: ${f.details}`);
  }
}

console.log();
if (failedTests === 0) {
  console.log("🎉 ALL TESTS PASSED — Ready for deployment!");
  process.exit(0);
} else {
  console.log("❌ SOME TESTS FAILED — Fix before deployment.");
  process.exit(1);
}
