#!/usr/bin/env node
// headersHelper for the memini MCP server. Claude Code runs this per connection
// and merges the JSON it prints over the static headers. We emit the
// cwd-resolved project namespace (the SAME resolver the hooks use, so capture
// and recall target one namespace) and a bearer token when one is configured —
// which is what makes a single remote memini work per-project.

import { resolveProject, readNamespace } from "./_shared.mjs";

// CLAUDE_PROJECT_DIR is authoritative when Claude Code supplies it. In practice
// the headersHelper runs in a bare shell WITHOUT it, and its cwd is the plugin
// install dir, so resolveProject(cwd) yields the plugin VERSION dir (e.g.
// "0.3.7") and collapses every project into one catch-all. Prefer, in order:
//   CLAUDE_PROJECT_DIR  ->  the namespace SessionStart cached  ->  cwd (last resort)
// Note: MEMINI_NAMESPACE (honored inside resolveProject) only overrides via the
// CLAUDE_PROJECT_DIR branch — when that env is unset the cache is preferred.
const projectDir = (process.env.CLAUDE_PROJECT_DIR || "").trim();
const namespace =
  (projectDir && resolveProject(projectDir)) ||
  readNamespace() ||
  resolveProject(process.cwd());

const headers = { "X-Memini-Namespace": namespace };
const token = process.env.MEMINI_TOKEN || process.env.MEMINI_API_KEY;
if (token) headers.Authorization = `Bearer ${token}`;

process.stdout.write(JSON.stringify(headers));
