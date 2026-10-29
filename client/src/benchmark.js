/**
 * Recursive Improvement Sandbox
 * Automatically benchmarks, verifies, and optimizes prompt formulations & TOON parsers
 * across complex and ambiguous user intents for Small Language Models.
 */

import { decode as decodeToon } from '@toon-format/toon';

export const EVALUATION_DATASET = [
  {
    query: "what tasks are in progress rn?",
    expectedTool: "get_tasks",
    expectedParams: { status: "doing" }
  },
  {
    query: "what are the tasks that i should do urgently",
    expectedTool: "get_tasks",
    expectedParams: { status: "todo", priority: "high" }
  },
  {
    query: "what have we finished so far?",
    expectedTool: "get_tasks",
    expectedParams: { status: "done" }
  },
  {
    query: "list all our tasks",
    expectedTool: "get_tasks",
    expectedParams: { status: "all" }
  },
  {
    query: "create a high priority task for API testing assigned to Sarah",
    expectedTool: "create_task",
    expectedParams: { title: "API testing", priority: "high", assignee: "Sarah" }
  },
  {
    query: "assign FAISS indexing to Alex",
    expectedTool: "assign_task",
    expectedParams: { task_title: "FAISS indexing", assignee: "Alex" }
  },
  {
    query: "move Database Setup to done",
    expectedTool: "move_task",
    expectedParams: { task_title: "Database Setup", status: "done" }
  },
  {
    query: "what upcoming meetings or company events do we have?",
    expectedTool: "get_events",
    expectedParams: {}
  },
  {
    query: "find the quarterly revenue report and OCR notes",
    expectedTool: "search_files",
    expectedParams: { query: "quarterly revenue report" }
  },
  {
    query: "what work was delivered or logged today?",
    expectedTool: "get_work_done",
    expectedParams: {}
  },
  // --- New test cases ---
  {
    query: "any new events in november",
    expectedTool: "get_events",
    expectedParams: { month: "november" }
  },
  {
    query: "what is my work log",
    expectedTool: "get_work_done",
    expectedParams: {}
  },
  {
    query: "are there any meetings this week",
    expectedTool: "get_events",
    expectedParams: {}
  },
  {
    query: "what did the team accomplish",
    expectedTool: "get_work_done",
    expectedParams: {}
  },
  {
    query: "search for the budget spreadsheet",
    expectedTool: "search_files",
    expectedParams: {}
  },
  {
    query: "what's on the calendar for next month",
    expectedTool: "get_events",
    expectedParams: {}
  },
  {
    query: "show me completed milestones",
    expectedTool: "get_work_done",
    expectedParams: {}
  },
  {
    query: "any announcements or conferences coming up",
    expectedTool: "get_events",
    expectedParams: {}
  }
];

export function robustParseToon(rawText) {
  if (!rawText) return null;
  const cleanText = rawText.replace(/```(toon)?/g, '').trim();

  // Try official decode
  try {
    const parsed = decodeToon(cleanText);
    if (parsed && typeof parsed === 'object' && parsed.tool) {
      return parsed;
    }
  } catch (e) {
    // Fall through to regex parser
  }

  // Regex line-by-line TOON extraction
  const toolMatch = cleanText.match(/tool:\s*([a-zA-Z0-9_-]+)/i);
  if (toolMatch) {
    const obj = { tool: toolMatch[1].trim() };
    const lines = cleanText.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim().toLowerCase();
        let val = line.slice(idx + 1).trim();
        // Strip optional surrounding quotes
        val = val.replace(/^["'](.*)["']$/, '$1');
        if (key && key !== 'tool' && val) {
          obj[key] = val;
        }
      }
    }
    return obj;
  }

  return null;
}

export function evaluatePredictions(predictions) {
  let passed = 0;
  const failures = [];

  for (let i = 0; i < EVALUATION_DATASET.length; i++) {
    const test = EVALUATION_DATASET[i];
    const pred = predictions[i];

    if (!pred || pred.tool !== test.expectedTool) {
      failures.push({
        query: test.query,
        expected: test.expectedTool,
        got: pred ? pred.tool : 'null',
        reason: 'Tool mismatch'
      });
      continue;
    }

    let paramsOk = true;
    for (const [k, v] of Object.entries(test.expectedParams)) {
      if (pred[k]?.toLowerCase() !== v.toLowerCase()) {
        paramsOk = false;
        failures.push({
          query: test.query,
          key: k,
          expectedVal: v,
          gotVal: pred[k] || 'missing',
          reason: 'Parameter mismatch'
        });
        break;
      }
    }

    if (paramsOk) {
      passed++;
    }
  }

  const score = (passed / EVALUATION_DATASET.length) * 100;
  return { score, passed, total: EVALUATION_DATASET.length, failures };
}
