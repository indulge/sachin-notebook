# Claude Code Basics: An Interactive Tutorial

> **How to use this file**: Paste the prompt blocks marked with ▶ into Claude Code one at a time.
> Each prompt builds on the previous step, creating a working mini-project as you go.
> By the end you will have built the same structure as this project — from scratch.

---

## Overview: The Five Building Blocks

Claude Code has five core extension points:

| Concept | What it is | Where it lives |
|---|---|---|
| **Tool** | A Python (or any) script that does deterministic work | `tools/` |
| **Workflow** | A markdown SOP that tells Claude which tools to run and how | `workflows/` |
| **Command** | A `/slash-command` that users type in Claude Code | `.claude/commands/` |
| **Skill** | A self-contained capability with its own assets and scripts | `.claude/skills/<name>/` |
| **Hook** | A shell command that fires automatically on lifecycle events | `.claude/settings.json` |

The mental model: **Hooks** start or end work automatically. **Commands** are how users trigger tasks. **Skills** are packaged capabilities. **Workflows** describe the steps. **Tools** do the actual execution.

