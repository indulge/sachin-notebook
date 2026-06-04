# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A public notebook site for Sachin, served via [Docsify](https://docsify.js.org). Docsify renders Markdown files dynamically in the browser — there is no build step and no static HTML generation. The entry point is `index.html`, and all content is written as `.md` files.

GitHub repo: `https://github.com/indulge/sachin-notebook`

## Local Preview

```bash
# Requires docsify-cli
npm i docsify-cli -g
docsify serve .
# Opens at http://localhost:3000
```

Without the CLI:
```bash
python3 -m http.server 3000
# Then open http://localhost:3000
```

## Adding Content

- New pages are `.md` files added anywhere in the repo.
- To make a page appear in the sidebar, create a `_sidebar.md` file listing the links.
- The homepage is `README.md`.
- Docsify configuration lives in `window.$docsify` inside `index.html`.

## Content Structure

```
index.html              # Docsify entry point (site name, repo link, config)
README.md               # Homepage content
claude-notes/           # Notes on Claude Code
  claude-workshop-1.md  # Tutorial: the five Claude Code extension points
```

## Claude Code Extension Points (from the workshop notes)

The notes document a pattern for extending Claude Code via five concepts:

| Concept | Location | Purpose |
|---|---|---|
| Tool | `tools/` | Python script — deterministic I/O, supports `--json` flag |
| Workflow | `workflows/` | Markdown SOP — orchestrates tools step-by-step |
| Command | `.claude/commands/` | Slash command — thin entry point that delegates to a workflow |
| Skill | `.claude/skills/<name>/` | Bundled capability with `SKILL.md`, `assets/`, `scripts/` |
| Hook | `.claude/settings.json` | Lifecycle triggers (`PreToolUse`, `PostToolUse`, `Stop`) |

**Tool convention**: always support `--json` for machine-readable output; print to stderr and `sys.exit(1)` on fatal errors; return `{"error": "..."}` in JSON for non-fatal failures so callers can decide.

**Hook paths**: always use absolute paths in `settings.json` hook `command` fields — relative paths silently fail because hooks run from a different working directory.
