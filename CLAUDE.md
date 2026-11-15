# SAB – how to work in this repo

Plugins enabled in `.claude/settings.json`: ponytail, i-have-adhd, caveman. The rules below apply
even when they are not loaded.

## Replies to the user (Hebrew, everyday language)
- Next action first. No preamble, no recap, no closing pleasantries.
- Multi-step → numbered steps. Lists: 5 items max.
- Short sentences, one idea each (caveman, lite level). Keep code, commands, paths and errors exact.
- Warnings, irreversible actions, and what did not work: full, clear sentences.
- Say the current state and what is done; end with one concrete next step for the user.

## Code (ponytail)
- Read the relevant code first. Then stop at the first rung that works: is it needed at all → already in
  the codebase → platform/stdlib → installed dependency → the minimum new code.
- One small test for code with logic (branches, parsing, filling, security).
- Never cut validation at trust boundaries, privacy (no student answers leave the page except to Claude),
  security or accessibility.
- Mark deliberate shortcuts with `// shortcut: <why> — revisit when <condition>`.
- After a change: say what was skipped or not checked.

## Project
- Chrome MV3 extension. `npm run typecheck`, `npm test`, `npm run build && npm run e2e`.
- Push to the session's branch; GitHub Actions publishes the `latest` release (auto-update).
