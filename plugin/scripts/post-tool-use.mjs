#!/usr/bin/env node
// PostToolUse hook. Records what just happened to a local session buffer
// instead of POSTing a memory per call. The buffer is distilled into one dense
// digest memory by session-end.mjs — far less noise than dozens of thin
// tool-use fragments, and zero network traffic on this hot path.
//
// Only state-changing tools are buffered (Edit/Write/Bash/...); read-only tools
// are surfaced live by PreToolUse and carry no recall value here. The matcher in
// hooks.json already narrows the events; this is a defensive second filter.

import {
  readStdin,
  parseJSON,
  readToolCall,
  appendSessionEvent,
  resolveProject,
  resolveProjectCached,
  writeNamespace,
  DEBUG,
} from "./_shared.mjs";

const FILE_KEYS = ["filePath", "file_path", "path", "file", "pattern"];
const RECORDED = new Set(["Edit", "MultiEdit", "Write", "Bash", "NotebookEdit", "Agent", "Task"]);

function firstFile(args) {
  if (!args || typeof args !== "object") return "";
  for (const k of FILE_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

async function main() {
  const payload = parseJSON(await readStdin()) || {};
  const { toolName, toolInput, sessionId, cwd } = readToolCall(payload);
  if (!toolName) return;

  // Re-warm the shared namespace cache for the MCP headersHelper: a concurrent
  // session in another project may have overwritten it (last-writer-wins), so
  // every matched tool call re-stamps it, correcting such clobbers promptly.
  // Runs after payload validation — an unvalidated payload must not trigger a
  // cache write — but independently of the RECORDED buffering below. The
  // project-map fast path keeps full re-warm semantics at file-read cost (zero
  // git subprocess spawns on this hot path); only a map miss pays for full
  // resolution. Best-effort — never blocks the hook's primary job (both
  // resolvers are throw-free, writeNamespace swallows its own errors).
  writeNamespace(resolveProjectCached(cwd) ?? resolveProject(cwd));

  if (!RECORDED.has(toolName)) return;

  const args = toolInput && typeof toolInput === "object" ? toolInput : {};
  const cmd = typeof args.command === "string" ? args.command : args.cmd;

  if (DEBUG) console.error(`[memini] PostToolUse buffer tool=${toolName} session=${sessionId}`);

  appendSessionEvent(sessionId, {
    ts: Date.now(),
    tool: toolName,
    file: firstFile(args),
    cmd: typeof cmd === "string" ? cmd : "",
  });
}

main().catch((e) => {
  if (DEBUG) console.error("[memini] PostToolUse error:", e);
});
