/**
 * Intent Detection Module
 * Shared logic for keyword-based fallback routing, LLM output parsing,
 * and tool data post-processing. Used by both ChatAssistant.jsx and sandbox-test.js.
 */

import { decode as decodeToon } from '@toon-format/toon';

// All month names and common abbreviations
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"
];

const MONTH_REGEX = new RegExp(`\\b(${MONTH_NAMES.join("|")})\\b`, "i");

// Normalize abbreviated months to full names
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

/**
 * Detect intent from a user query using keyword matching.
 * This is a fallback when the LLM fails to produce a valid action.
 *
 * @param {string} userQuery - The raw user query text
 * @returns {{ tool: string, [key: string]: string }} - Tool routing data
 */
export function detectIntentFromQuery(userQuery) {
  const q = userQuery.toLowerCase();

  // --- Files (check BEFORE events because "search for meeting notes" is a file search, not event query) ---
  const fileKeywords = [
    "file", "document", "pdf", "notes", "report",
    "doc", "presentation", "spreadsheet", "find the"
  ];
  // "search" + file keyword → definitely file intent
  const hasFileKeyword = fileKeywords.some(kw => q.includes(kw));
  const hasSearchPrefix = q.includes("search");
  if (hasSearchPrefix && hasFileKeyword) {
    return { tool: "search_files", query: userQuery };
  }

  // --- Events ---
  const eventKeywords = [
    "event", "meeting", "summit", "conference", "calendar",
    "schedule", "upcoming", "announcement", "keynote",
    "what's on", "whats on", "any conferences", "any events"
  ];
  const hasEventKeyword = eventKeywords.some(kw => q.includes(kw));

  // If query contains a month name and does NOT explicitly mention "task"
  const monthMatch = q.match(MONTH_REGEX);
  const mentionsTask = q.includes("task");

  if (hasEventKeyword || (monthMatch && !mentionsTask)) {
    return {
      tool: "get_events",
      month: monthMatch ? normalizeMonth(monthMatch[1]) : ""
    };
  }

  // --- Work Done / Logs ---
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

  // --- Default: tasks ---
  return { tool: "get_tasks", status: "all" };
}

/**
 * Parse LLM raw text output into structured tool data.
 * Tries TOON decode first, then falls back to regex line-by-line extraction.
 *
 * @param {string} rawText - Raw text output from the LLM
 * @returns {{ tool: string, [key: string]: string } | null}
 */
export function parseLLMOutput(rawText) {
  if (!rawText) return null;

  // Try to extract text after "Action:" marker first
  let textToParse = rawText;
  const actionMatch = rawText.match(/Action:\s*([\s\S]*)/i);
  if (actionMatch) {
    textToParse = actionMatch[1].trim();
  }

  // Try TOON decode
  try {
    const cleanText = textToParse.replace(/```(toon)?/g, '').trim();
    const parsed = decodeToon(cleanText);
    if (parsed && typeof parsed === 'object' && parsed.tool) {
      return parsed;
    }
  } catch {
    // Fall through to regex
  }

  // Regex line-by-line extraction
  const toolMatch = textToParse.match(/tool:\s*([a-zA-Z0-9_-]+)/i);
  if (toolMatch) {
    const obj = { tool: toolMatch[1].trim() };
    const lines = textToParse.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim().toLowerCase();
        let val = line.slice(idx + 1).trim();
        // Strip optional surrounding quotes
        val = val.replace(/^["'](.*?)["']$/, '$1');
        if (key && key !== 'tool' && key !== 'thought' && key !== 'action' && val) {
          obj[key] = val;
        }
      }
    }
    return obj;
  }

  // Last resort: try full rawText (not just after Action:)
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

/**
 * Post-process tool data to fix missing or incorrect parameters.
 * Cross-references the user query to fill in gaps.
 *
 * @param {{ tool: string, [key: string]: string }} toolData - Parsed tool data
 * @param {string} userQuery - The original user query
 * @returns {{ tool: string, [key: string]: string }} - Refined tool data
 */
export function refineToolData(toolData, userQuery) {
  if (!toolData || !toolData.tool) return toolData;

  const q = userQuery.toLowerCase();
  const tool = toolData.tool.toLowerCase().trim();
  const refined = { ...toolData, tool };

  // If tool is get_events but month is missing, try to extract it
  if (tool === "get_events" && !refined.month) {
    const monthMatch = q.match(MONTH_REGEX);
    if (monthMatch) {
      refined.month = normalizeMonth(monthMatch[1]);
    }
  }

  // If tool is search_files but query is missing, use the user query
  if (tool === "search_files" && !refined.query) {
    refined.query = userQuery;
  }

  // If tool is get_tasks and status is missing, default to "all"
  if (tool === "get_tasks" && !refined.status) {
    refined.status = "all";
  }

  return refined;
}
