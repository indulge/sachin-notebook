---
sidebar_label: "Extension Points Reference"
sidebar_position: 10
---

# Claude Code Extension Points

Claude Code has five extension points that let you add capabilities without modifying core behavior. Each has a specific role and location.

```
User types: /weather Mumbai
       │
       ▼
.claude/commands/weather.md          ← COMMAND   (entry point, arg parsing)
       │
       ▼
workflows/weather_comparison.md      ← WORKFLOW  (step-by-step SOP)
       │
       ▼
tools/get_weather.py                 ← TOOL      (deterministic execution)

Meanwhile, automatically before every Bash call...

.claude/settings.json PreToolUse     ← HOOK      (lifecycle trigger)

And bundled, self-contained capabilities...

.claude/skills/explain-semaphore/    ← SKILL     (portable package)
```

---

## Tool

**Location:** `tools/`

A Tool is a Python script that does exactly one thing: deterministic input → deterministic output. Claude delegates I/O and external calls to tools rather than doing them inline. This keeps AI reasoning separate from side effects.

**Key properties:**
- Takes arguments via `sys.argv`
- Prints results to stdout (text or JSON)
- Exits non-zero on failure
- Supports `--json` flag for machine-readable output

```python
# tools/get_weather.py
import sys
import json
import requests

def get_weather(location: str = "", as_json: bool = False) -> None:
    url = f"https://wttr.in/{location}?format=j1"
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    data = response.json()

    nearest = data["nearest_area"][0]
    city    = nearest["areaName"][0]["value"]
    country = nearest["country"][0]["value"]

    current = data["current_condition"][0]
    temp_c  = current["temp_C"]
    temp_f  = current["temp_F"]
    desc    = current["weatherDesc"][0]["value"]
    humidity = current["humidity"]
    wind    = current["windspeedKmph"]
    wind_dir = current["winddir16Point"]

    if as_json:
        print(json.dumps({
            "city": city, "country": country,
            "temp_c": int(temp_c), "temp_f": int(temp_f),
            "condition": desc, "humidity": humidity,
            "wind_kmph": wind, "wind_dir": wind_dir
        }))
    else:
        print(f"Weather for {city}, {country}")
        print(f"  Temperature : {temp_c}°C / {temp_f}°F")
        print(f"  Condition   : {desc}")
        print(f"  Humidity    : {humidity}%")
        print(f"  Wind        : {wind} km/h {wind_dir}")

if __name__ == "__main__":
    location = sys.argv[1] if len(sys.argv) > 1 else ""
    as_json  = "--json" in sys.argv
    get_weather(location, as_json)
```

**Invoke without `--json`** (human-readable):
```
python3 tools/get_weather.py Mumbai
Weather for Mumbai, India
  Temperature : 31°C / 88°F
  Condition   : Haze
  Humidity    : 75%
  Wind        : 21 km/h SW
```

**Invoke with `--json`** (machine-readable, for Claude to parse):
```json
{
  "city": "Mumbai", "country": "India",
  "temp_c": 31, "temp_f": 88,
  "condition": "Haze", "humidity": "75",
  "wind_kmph": "21", "wind_dir": "SW"
}
```

**Error convention:**
```python
# Fatal errors: print to stderr, exit 1
if response.status_code != 200:
    print(f"Error: HTTP {response.status_code}", file=sys.stderr)
    sys.exit(1)

# Non-fatal errors: return error key in JSON so caller decides what to do
print(json.dumps({"error": "rate limited — try again later"}))
```

---

## Workflow

**Location:** `workflows/`

A Workflow is a markdown file that acts as an SOP (Standard Operating Procedure). It tells Claude which tools to run, in which order, what fields to parse from each output, and what to do when things go wrong.

**Why markdown, not code?** The coordination logic (if country is X do Y; if tool returns error skip Z) requires judgment. Markdown lets Claude reason over edge cases that no static script can anticipate. And unlike an inline prompt, a workflow file is versioned, improvable, and reusable.

```markdown
# Workflow: Weather Comparison

## Objective
Fetch weather for a given location, find the hottest city in the same country,
and print a formatted comparison summary.

## Required Inputs
- `location`: city name or empty string (auto-detects via IP)

## Steps

1. Run `python3 tools/get_weather.py "<location>" --json`
   - Parse JSON output: city, country, temp_c, temp_f, feels_c, feels_f,
     condition, humidity, wind_kmph, wind_dir

2. Extract the `country` field from step 1.

3. Run `python3 tools/get_hottest_city.py "<country>"`
   - Parse JSON output: city, temp_c, condition
   - If the result contains an `error` key, skip the comparison section

4. Print the formatted summary:
   ```
   Weather Report: <city>, <country>
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Temperature: <temp_c>°C / <temp_f>°F
     ...
   Hottest in <country>: <hottest_city> at <hottest_temp_c>°C
     <city> is X°C cooler/hotter than the hottest city
   ```

5. Run `python3 tools/get_quote.py`
   - Append quote to summary; if error key is present, skip silently.

## Edge Cases
- If get_hottest_city.py returns an error, show only current weather.
- If location is empty, wttr.in auto-detects via IP.
- If current city == hottest city, say "You're in the hottest city!"
```

**Workflow structure template:**
```markdown
# Workflow: <Name>

## Objective
One sentence — what this workflow produces.

## Required Inputs
- `param`: description

## Steps
1. Run `python3 tools/foo.py "<param>" --json`
   - Parse: field_a, field_b
2. Use field_a to run `python3 tools/bar.py "<field_a>"`
   - If result has "error" key: [fallback behavior]
3. Print formatted output using values from steps 1 and 2.

## Edge Cases
- If step N fails: do X instead
```

---

## Command

**Location:** `.claude/commands/`

A Command is a markdown file that creates a `/slash-command` in Claude Code. When a user types `/weather Mumbai`, Claude reads `.claude/commands/weather.md`, extracts the argument (`Mumbai`), and follows the file's instructions.

**A command is the interface; the workflow is the implementation.** Commands should be intentionally thin — they document usage and delegate to a workflow. All real logic lives in the workflow.

```markdown
Fetch current weather and compare it against the hottest city in the same country.

## Usage
/weather [location]

- `/weather`         — auto-detects location based on IP
- `/weather Mumbai`  — fetches weather for a specific city
- `/weather New York` — multi-word city names work too

## Steps
1. Extract the location argument from the invocation (everything after `/weather`).
   If none provided, use an empty string.
2. Read and follow `workflows/weather_comparison.md` exactly, passing the
   location as input.
```

**Command file anatomy:**

| Section | Purpose |
|---|---|
| First line (no heading) | Short description shown in Claude Code's command picker |
| `## Usage` | Documents how to invoke the command and what arguments it takes |
| `## Steps` | What Claude should do: parse args, delegate to workflow |

**Argument parsing:** `everything after /weather` is how commands receive arguments — Claude parses this naturally from the invocation text. No configuration needed.

```markdown
# Pattern for single optional argument
1. Extract everything after "/command-name" as the argument; use "" if nothing provided.
2. Read and follow `workflows/relevant_workflow.md` exactly, passing arg as input.

# Pattern for named flags
1. Check for --verbose flag in the invocation text.
2. Extract the topic argument (text that is not a flag).
3. Read and follow `workflows/news_briefing.md`, passing topic and verbose flag.
```

---

## Skill

**Location:** `.claude/skills/<name>/`

A Skill is a self-contained, portable capability. Unlike a command (thin entry point) or a workflow (orchestrates external tools), a skill bundles everything it needs:

- `SKILL.md` — full instructions for executing this capability
- `assets/` — reference data, PDFs, lookup tables the skill reads at runtime
- `scripts/` — helper scripts specific to this skill alone

**Portability:** copy the entire skill directory into any other Claude Code project and it works immediately — no dependencies outside the directory.

```
.claude/skills/explain-semaphore/
├── SKILL.md
├── assets/
│   └── LittleBookOfSemaphores.pdf
└── scripts/
    └── extract_chapter.py
```

**`SKILL.md` with frontmatter:**
```markdown
---
description: Explain semaphore concepts, puzzles, and patterns using
             The Little Book of Semaphores as the authoritative local reference.
---

# Skill: explain-semaphore

## Purpose
Answer questions about semaphores by extracting and reasoning over the
actual text of The Little Book of Semaphores (Downey, 2016).

## Setup (first time only)
If assets/LittleBookOfSemaphores.pdf is missing:
  Run: curl -L -o .claude/skills/explain-semaphore/assets/LittleBookOfSemaphores.pdf \
       "https://greenteapress.com/semaphores/LittleBookOfSemaphores.pdf"

## Steps
1. Verify the PDF exists; if not, run the setup command above.
2. Identify what the user wants — chapter, puzzle, concept, or pattern.
3. Extract relevant text using scripts/extract_chapter.py or direct page reads.
4. Read extracted text carefully before answering.
5. Explain with: what it is, why it matters, pseudocode, invariants, pitfalls.
6. Offer to go deeper on sub-concepts.

## Book Structure (quick reference)
| Chapter | Topic |
|---|---|
| 1 | Introduction |
| 2 | Semaphore definition |
| 3 | Basic synchronization patterns |
| 4 | Classical synchronization problems |
| 5 | Less classical problems |

## Example invocations
- "explain the producer-consumer problem"
- "show me the dining philosophers solution"
- /explain-semaphore chapter 4
```

**`description:` frontmatter** is what Claude Code shows in the skill picker and uses to decide when to auto-invoke the skill.

**Helper script example:**
```python
# .claude/skills/explain-semaphore/scripts/extract_chapter.py
"""Extract a chapter's text from the PDF for Claude to read."""
import sys
import subprocess

def extract_pages(pdf_path: str, start: int, end: int) -> str:
    result = subprocess.run(
        ["pdftotext", "-f", str(start), "-l", str(end), pdf_path, "-"],
        capture_output=True, text=True
    )
    return result.stdout

if __name__ == "__main__":
    pdf = sys.argv[1]
    start, end = int(sys.argv[2]), int(sys.argv[3])
    print(extract_pages(pdf, start, end))
```

**Skill vs Command vs Workflow:**

| | Command | Workflow | Skill |
|---|---|---|---|
| Entry point | `/name` typed by user | Read by Claude or a Command | Invoked automatically or via `/name` |
| Assets bundled | No | No | Yes |
| Self-contained | No | No | Yes |
| Use case | User-facing shortcut | Multi-step orchestration | Capability requiring reference data |

Use a **skill** when the capability needs bundled reference material or helper scripts specific to that capability alone. Use a **command + workflow + tool** when orchestrating external APIs.

---

## Hook

**Location:** `.claude/settings.json` → `"hooks"`

A Hook is a shell command that Claude Code runs automatically when a lifecycle event occurs. Hooks attach behavior to Claude's lifecycle without requiring the user to ask — the work just happens.

**Available lifecycle events:**

| Event | When it fires |
|---|---|
| `PreToolUse` | Before Claude calls any tool |
| `PostToolUse` | After a tool call completes |
| `Stop` | After Claude finishes a response |
| `Notification` | When Claude Code sends a user notification |

**Hook schema in `settings.json`:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /absolute/path/to/.claude/scripts/bash-auditor.py"
          }
        ]
      }
    ]
  }
}
```

> **Always use absolute paths.** Hooks run from a different working directory than the project root. Relative paths like `python3 .claude/scripts/foo.py` silently fail.

**`matcher`** filters by tool name for `PreToolUse`/`PostToolUse`. Empty string `""` matches all tools.

### Hook payload (stdin JSON)

For `PreToolUse` and `PostToolUse`:
```json
{
  "session_id": "abc123",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "python3 tools/get_weather.py Mumbai --json"
  }
}
```

For `Stop`:
```json
{
  "session_id": "abc123",
  "hook_event_name": "Stop",
  "transcript_path": "/home/user/.claude/transcripts/abc123.jsonl"
}
```

### Example: Bash command auditor (PreToolUse)

Logs every shell command Claude runs to an audit file:

```python
# .claude/scripts/bash-auditor.py
import json
import sys
from datetime import datetime
from pathlib import Path

payload = json.load(sys.stdin)
command = payload.get("tool_input", {}).get("command", "")
if not command.strip():
    sys.exit(0)

log = Path(__file__).parent.parent / "bash-audit.log"
timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
truncated = command.replace("\n", " ")[:120]
with log.open("a") as f:
    f.write(f"[{timestamp}] {truncated}\n")
```

After a session, `cat .claude/bash-audit.log` shows:
```
[2026-05-29 21:30:14] python3 tools/get_weather.py Mumbai --json
[2026-05-29 21:30:16] python3 tools/get_hottest_city.py India
[2026-05-29 21:30:19] python3 tools/get_quote.py
```

### Example: Auto-format on file write (PostToolUse)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'File written' >> /abs/path/.claude/write-log.txt"
          }
        ]
      }
    ]
  }
}
```

### Example: Run tests after every Bash call (PostToolUse)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -m pytest tests/ -q 2>&1 | tail -5"
          }
        ]
      }
    ]
  }
}
```

### Example: Log session end (Stop)

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"Session ended at $(date)\" >> /abs/path/.claude/session-log.txt"
          }
        ]
      }
    ]
  }
}
```

**Inline command vs Python script:** use an inline shell command for fire-and-forget hooks (timestamps, notifications). Use a Python script when you need to parse the stdin JSON payload or apply conditional logic.

---

## File Layout Reference

```
project/
├── tools/                          # Tools — Python scripts
│   ├── get_weather.py
│   ├── get_hottest_city.py
│   └── get_quote.py
├── workflows/                      # Workflows — Markdown SOPs
│   └── weather_comparison.md
├── .claude/
│   ├── commands/                   # Commands — Slash commands
│   │   ├── weather.md              #   /weather [location]
│   │   └── daily-quote.md          #   /daily-quote
│   ├── skills/                     # Skills — Self-contained capabilities
│   │   └── explain-semaphore/
│   │       ├── SKILL.md
│   │       ├── assets/
│   │       │   └── LittleBookOfSemaphores.pdf
│   │       └── scripts/
│   │           └── extract_chapter.py
│   ├── scripts/                    # Hook scripts
│   │   └── bash-auditor.py
│   └── settings.json               # Hook configuration
└── .env                            # API keys — never commit
```
