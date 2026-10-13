# CLAUDE.md

Project-specific instructions for Claude Code. AGENTS.md (BDD-first workflow) also applies.

## Persistent memory (agent-memory MCP)

This project has a persistent technical memory in the `agent-memory` MCP server
(PostgreSQL, project key `testfly-playwright`). It is the source of truth for
past decisions, known issues, and verified facts about the framework.

### Read before you work
- At the start of any non-trivial task, call `memory_search` with the topic
  keywords (e.g. `locators`, `fixtures`, `ApiClient`, `cli`, `config`, `ci`).
- Use `memory_get(entry_id)` to read a full entry and its session neighbours.
- Treat `issue` entries as known, verified discrepancies. Do not re-discover them;
  reference and update them.

### Write when you learn something
Save with `memory_save` when any of these happen:
- A design or implementation decision is made → `entry_type: "decision"`
- A bug or doc/code mismatch is verified → `entry_type: "issue"`
- A fix or workaround is implemented and verified → `entry_type: "solution"`
- A verified fact about architecture or public API is established → `entry_type: "document"`
- A short operational note (commands, gotchas) → `entry_type: "note"`

Rules for every `memory_save` call:
- Pass `session_id` with the current Claude Code session id. The SessionStart
  hook in `.claude/settings.json` injects it into context as
  "Claude Code session_id: <uuid>". Pass `agent_name: "claude-code"`.
- Set `source_ref` to the file path and, when relevant, the class or function
  name (e.g. `src/locators/LocatorParser.ts (parseContent)`).
- Set `tags` (lowercase, 3–8 items) and a concise `title`.
- Do not duplicate an existing entry; search first. If an entry is superseded,
  save a new one that names the old entry id in `content` and `metadata`.
- Never save secrets, credentials, or `.env` contents.

Allowed `entry_type` values: `decision`, `issue`, `solution`, `note`,
`document`, `summary`, `message`.

### End of task
Before reporting completion, check whether the work produced anything worth
remembering. If yes, save it. If nothing new was learned, say so explicitly in
the final message.
