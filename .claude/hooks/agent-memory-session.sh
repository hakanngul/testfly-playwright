#!/usr/bin/env bash
# SessionStart hook: inject the Claude Code session id so the agent can pass it
# to agent-memory's memory_save(session_id=...) and group entries per session.
set -euo pipefail

input="$(cat)"
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
source="$(printf '%s' "$input" | jq -r '.source // "startup"')"

if [ -z "$session_id" ]; then
  exit 0
fi

context="agent-memory session context:
- Claude Code session_id: ${session_id} (source: ${source})
- Project key: testfly-playwright
- When calling mcp__agent-memory__memory_save, ALWAYS pass session_id=\"${session_id}\" and agent_name=\"claude-code\".
- Before starting non-trivial work, run memory_search for the topic (locators, fixtures, cli, config, ...) and reuse prior decisions.
- Before finishing a task that produced a decision, issue, solution, or verified fact, save it with memory_save using the matching entry_type and a source_ref to the file/function."

jq -n --arg ctx "$context" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'
