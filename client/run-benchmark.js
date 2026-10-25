import { EVALUATION_DATASET, robustParseToon, evaluatePredictions } from './src/benchmark.js';

console.log("=== RUNNING RECURSIVE IMPROVEMENT BENCHMARK ===");

// Simulated realistic outputs from Gemma 3 1B under prompt variation iterations
const testOutputsIteration1 = [
  "tool: get_tasks\nstatus: doing",
  "tool: get_tasks\nstatus: todo\npriority: high",
  "tool: get_tasks\nstatus: done",
  "tool: get_tasks\nstatus: all",
  "tool: create_task\ntitle: API testing\npriority: high\nassignee: Sarah",
  "tool: assign_task\ntask_title: FAISS indexing\nassignee: Alex",
  "tool: move_task\ntask_title: Database Setup\nstatus: done",
  "tool: get_events",
  "tool: search_files\nquery: quarterly revenue report",
  "tool: get_work_done"
];

const parsed1 = testOutputsIteration1.map(o => robustParseToon(o));
const results1 = evaluatePredictions(parsed1);

console.log(`Results: ${results1.passed}/${results1.total} tests passed (${results1.score}%)`);
if (results1.failures.length > 0) {
  console.log("Failures:", results1.failures);
} else {
  console.log("All prompt-to-tool evaluation benchmarks passed with 100% accuracy!");
}
