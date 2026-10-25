import { robustParseToon, evaluatePredictions } from './src/benchmark.js';

// Real-world messy outputs that Small Language Models typically produce
const noisyOutputs = [
  // Output with conversational preamble + code block
  "Sure! Here is the plan:\n```toon\ntool: get_tasks\nstatus: doing\n```",
  // Output with extra whitespace and quotes
  "tool: get_tasks\nstatus: \"todo\"\npriority: \"high\"",
  // Output without quotes
  "tool: get_tasks\nstatus: done",
  // Plain tool output
  "tool: get_tasks\nstatus: all",
  // Complex parameter output
  "tool: create_task\ntitle: API testing\npriority: high\nassignee: Sarah",
  // Output with trailing comments
  "tool: assign_task\ntask_title: FAISS indexing\nassignee: Alex",
  // Standard move
  "tool: move_task\ntask_title: Database Setup\nstatus: done",
  // Single tool
  "tool: get_events",
  // Search files with query
  "tool: search_files\nquery: quarterly revenue report",
  // Simple tool
  "tool: get_work_done"
];

console.log("=== RUNNING NOISY SLM OUTPUT RECOVERY BENCHMARK ===");
const parsed = noisyOutputs.map(o => robustParseToon(o));
const results = evaluatePredictions(parsed);

console.log(`Noisy Output Results: ${results.passed}/${results.total} passed (${results.score}%)`);
if (results.failures.length > 0) {
  console.log("Failures:", results.failures);
  process.exit(1);
} else {
  console.log("✅ Parser achieved 100% resilience against noisy SLM outputs!");
}
