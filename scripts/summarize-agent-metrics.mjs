import fs from 'node:fs';
import readline from 'node:readline';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/summarize-agent-metrics.mjs <redacted-events.ndjson>');
  process.exit(2);
}

const totals = {
  events: 0,
  invalidEvents: 0,
  toolCalls: 0,
  fileReads: 0,
  modelUsageEvents: 0,
  completedTasks: 0,
  taskEnds: 0,
  durationMs: 0,
  durationEvents: 0,
  maxDurationMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
  cacheHits: 0,
  cacheObservations: 0,
  repeatedCommandCalls: 0,
  repeatedFileReads: 0
};
const tasks = new Set();
const commandsByTask = new Map();
const filesByTask = new Map();

try {
  const lines = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      totals.invalidEvents++;
      continue;
    }
    if (!event || typeof event !== 'object' || typeof event.event !== 'string') {
      totals.invalidEvents++;
      continue;
    }

    totals.events++;
    const taskId = typeof event.task_id === 'string' && event.task_id ? event.task_id : 'unknown';
    tasks.add(taskId);
    addDuration(event.duration_ms);

    if (event.event === 'tool_call') {
      totals.toolCalls++;
      countRepeat(commandsByTask, taskId, event.command_class, 'repeatedCommandCalls');
    } else if (event.event === 'file_read') {
      totals.fileReads++;
      countRepeat(filesByTask, taskId, event.file_id, 'repeatedFileReads');
    } else if (event.event === 'model_usage') {
      totals.modelUsageEvents++;
      totals.inputTokens += nonNegativeNumber(event.input_tokens);
      totals.outputTokens += nonNegativeNumber(event.output_tokens);
      totals.reasoningTokens += nonNegativeNumber(event.reasoning_tokens);
      totals.costUsd += nonNegativeNumber(event.cost_usd);
      if (typeof event.cache_hit === 'boolean') {
        totals.cacheObservations++;
        if (event.cache_hit) totals.cacheHits++;
      }
    } else if (event.event === 'task_end') {
      totals.taskEnds++;
      if (event.completed === true) totals.completedTasks++;
    } else {
      totals.invalidEvents++;
    }
  }
} catch {
  console.error('Unable to read metrics file');
  process.exit(1);
}

console.log('Agent efficiency metrics');
console.log(`tasks: ${tasks.size}`);
console.log(`events: ${totals.events} (invalid: ${totals.invalidEvents})`);
console.log(`completed tasks: ${totals.completedTasks}/${totals.taskEnds}`);
console.log(`tool calls: ${totals.toolCalls} (repeated: ${totals.repeatedCommandCalls})`);
console.log(`file reads: ${totals.fileReads} (repeated: ${totals.repeatedFileReads})`);
console.log(`latency: ${formatNumber(totals.durationMs)} ms across ${totals.durationEvents} events; max ${formatNumber(totals.maxDurationMs)} ms`);
console.log(`tokens: input ${formatNumber(totals.inputTokens)}, output ${formatNumber(totals.outputTokens)}, reasoning ${formatNumber(totals.reasoningTokens)}`);
console.log(`cost: $${totals.costUsd.toFixed(6)}`);
console.log(`cache hits: ${totals.cacheHits}/${totals.cacheObservations} (${percentage(totals.cacheHits, totals.cacheObservations)})`);

function addDuration(value) {
  const duration = nonNegativeNumber(value);
  if (!Number.isFinite(duration) || duration === 0 && value !== 0) return;
  totals.durationMs += duration;
  totals.durationEvents++;
  totals.maxDurationMs = Math.max(totals.maxDurationMs, duration);
}

function countRepeat(index, taskId, value, counter) {
  if (typeof value !== 'string' || !value) return;
  const key = `${taskId}\u0000${value}`;
  const count = (index.get(key) || 0) + 1;
  index.set(key, count);
  if (count > 1) totals[counter]++;
}

function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function percentage(numerator, denominator) {
  return denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'n/a';
}
