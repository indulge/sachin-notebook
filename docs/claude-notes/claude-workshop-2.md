# Workshop 2: Building AI Agents & MCP Servers

> **How to use this file**: Work through each section hands-on.
> Each section builds toward a fully functional AI agent and a custom MCP server.
> Prerequisites: Python 3.10+, `pip install anthropic`, an Anthropic API key in `ANTHROPIC_API_KEY`.

---

## Overview: What You'll Build

```
┌─────────────────────────────────────────────────────┐
│                 AI AGENT ANATOMY                    │
│                                                     │
│   User prompt                                       │
│       │                                             │
│       ▼                                             │
│   Claude (reasons) ──── needs data ────► Tool call  │
│       │                                    │        │
│       │◄──────── tool result ──────────────┘        │
│       │                                             │
│   Claude (reasons again) ──── done ──► Final reply  │
└─────────────────────────────────────────────────────┘
```

An **agent** is not magic — it is a loop: LLM reasons, calls a tool, gets a result, reasons again, stops when done. This workshop covers:

| Topic | What you'll learn |
|---|---|
| **Anthropic SDK** | Chat completions, streaming, system prompts |
| **Tool Use** | Define tools as JSON schema, parse tool calls |
| **Agentic Loop** | The while-loop that makes Claude autonomous |
| **Multi-tool Agent** | Agent with 3+ tools that chains calls |
| **MCP Protocol** | What MCP is and how servers and clients talk |
| **MCP Server** | Build a custom MCP server in Python |

---

## Section 1 — The Anthropic SDK

### Basic Chat Completion

```python
# agent/01_basic_chat.py
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from environment

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="You are a concise assistant. Answer in one sentence.",
    messages=[
        {"role": "user", "content": "What is the capital of France?"}
    ]
)

print(response.content[0].text)
# → "The capital of France is Paris."
```

**Key parameters:**
- `model` — which Claude to use (use `claude-sonnet-4-6` for most tasks)
- `max_tokens` — hard cap on response length; set it high enough for your use case
- `system` — the system prompt, sets persona and constraints
- `messages` — list of `{role, content}` dicts; role is `user` or `assistant`

### Multi-turn Conversation

Keep track of the message list yourself — the API is stateless:

```python
# agent/02_multiturn.py
import anthropic

client = anthropic.Anthropic()
messages = []

def chat(user_message: str) -> str:
    messages.append({"role": "user", "content": user_message})
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=messages
    )
    reply = response.content[0].text
    messages.append({"role": "assistant", "content": reply})
    return reply

print(chat("My name is Sachin."))
print(chat("What's my name?"))  # Claude remembers because we keep messages[]
```

### Streaming Responses

```python
# agent/03_streaming.py
import anthropic

client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=512,
    messages=[{"role": "user", "content": "Count from 1 to 10 slowly."}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
print()  # newline at end
```

Use streaming when response time matters to the user experience — they see output immediately instead of waiting for the full response.

### ▶ Exercise 1

```
Create agent/chat_repl.py — a simple REPL that:
1. Reads a line from the user (input("> "))
2. Sends it to Claude claude-sonnet-4-6 with a system prompt: "You are a helpful assistant."
3. Prints the response (streaming, so text appears as it arrives)
4. Loops until the user types "quit" or "exit"
5. Maintains conversation history so Claude can reference earlier messages

Run it: python3 agent/chat_repl.py
```

---

## Section 2 — Tool Use (Function Calling)

### How Tools Work

You define tools as JSON Schema objects. Claude can decide to call one by returning a `tool_use` block instead of text. You then run the tool and send the result back.

```
User: "What's the weather in Mumbai?"
  │
  ▼
Claude: [thinks: I need weather data]
  → returns tool_use { name: "get_weather", input: { city: "Mumbai" } }
  │
  ▼
Your code: calls get_weather("Mumbai") → "31°C, humid"
  │
  ▼
Claude: [gets result, formats response]
  → returns text "It's 31°C and humid in Mumbai right now."
```

### Defining a Tool

```python
# agent/04_tool_use.py
import anthropic
import json

client = anthropic.Anthropic()

# Define the tool schema
tools = [
    {
        "name": "get_weather",
        "description": "Get current weather for a city. Returns temperature in Celsius and condition.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, e.g. 'Mumbai' or 'London'"
                }
            },
            "required": ["city"]
        }
    }
]

# Fake implementation — replace with real API call
def get_weather(city: str) -> dict:
    fake_data = {
        "Mumbai": {"temp_c": 31, "condition": "Humid"},
        "London": {"temp_c": 14, "condition": "Cloudy"},
        "Tokyo":  {"temp_c": 22, "condition": "Sunny"},
    }
    return fake_data.get(city, {"temp_c": 20, "condition": "Unknown"})

# Step 1: Send user message with tools available
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "What's the weather in Mumbai?"}]
)

print("Stop reason:", response.stop_reason)  # "tool_use"

# Step 2: Check if Claude wants to call a tool
if response.stop_reason == "tool_use":
    tool_call = next(b for b in response.content if b.type == "tool_use")
    print(f"Tool called: {tool_call.name}")
    print(f"Tool input: {tool_call.input}")

    # Step 3: Run the tool
    result = get_weather(tool_call.input["city"])

    # Step 4: Send result back to Claude
    final = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        tools=tools,
        messages=[
            {"role": "user", "content": "What's the weather in Mumbai?"},
            {"role": "assistant", "content": response.content},
            {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_call.id,
                    "content": json.dumps(result)
                }]
            }
        ]
    )
    print(final.content[0].text)
```

**The key pattern:** `tool_result` messages must reference the `tool_use_id` from Claude's response. This ties the result to the specific call.

---

## Section 3 — The Agentic Loop

### From One Tool Call to Autonomous Execution

A single tool call is not an agent. An agent keeps running until it decides it is done:

```python
# agent/05_agent_loop.py
import anthropic
import json

client = anthropic.Anthropic()

# --- Tool definitions ---
tools = [
    {
        "name": "calculate",
        "description": "Evaluate a mathematical expression. Input is a string like '2 + 2' or 'sqrt(16)'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "Math expression to evaluate"}
            },
            "required": ["expression"]
        }
    },
    {
        "name": "get_current_time",
        "description": "Returns the current date and time as a string.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]

# --- Tool implementations ---
import math
from datetime import datetime

def calculate(expression: str) -> str:
    try:
        # Safe eval: only math functions
        allowed = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
        result = eval(expression, {"__builtins__": {}}, allowed)
        return str(result)
    except Exception as e:
        return f"Error: {e}"

def get_current_time() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

TOOL_MAP = {
    "calculate": lambda inp: calculate(inp["expression"]),
    "get_current_time": lambda inp: get_current_time(),
}

# --- The agent loop ---
def run_agent(user_message: str) -> str:
    messages = [{"role": "user", "content": user_message}]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            tools=tools,
            messages=messages
        )

        # Append Claude's response to history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Claude is done — extract the final text
            text_blocks = [b for b in response.content if hasattr(b, "text")]
            return text_blocks[-1].text if text_blocks else ""

        if response.stop_reason == "tool_use":
            # Execute all tool calls in this response
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    print(f"  [tool] {block.name}({block.input})")
                    result = TOOL_MAP[block.name](block.input)
                    print(f"  [result] {result}")
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })

            messages.append({"role": "user", "content": tool_results})
            # Loop again — Claude will process results and may call more tools

# Try it
answer = run_agent("What time is it right now? Also, what is 17 * 23 + sqrt(144)?")
print("\nFinal answer:", answer)
```

### The Loop Anatomy

```
while True:
    response = llm.complete(messages)
    messages.append(response)

    if response.stop_reason == "end_turn":
        return final_text        ← Claude decided it's done

    if response.stop_reason == "tool_use":
        for each tool call in response:
            result = execute_tool(tool_call)
        messages.append(all_results)
        continue                 ← Claude sees results, loops again
```

This pattern is universal — it works with any LLM that supports tool use, not just Claude.

### ▶ Exercise 2

```
Build agent/file_agent.py — an agent with three tools:

1. read_file(path): reads and returns a file's contents (use open())
2. write_file(path, content): writes content to a file
3. list_files(directory): lists files in a directory (use os.listdir())

Use the agent loop pattern from 05_agent_loop.py.

Test it with this prompt:
  "Read agent/05_agent_loop.py and write a one-paragraph summary to agent/summary.txt"

The agent should: call read_file → read the code → call write_file → done.
```

---

## Section 4 — Multi-Tool Agent: A Research Assistant

### Combining Real Tools

```python
# agent/research_agent.py
"""
A research agent that can:
- Search the web (via DuckDuckGo's instant-answer API)
- Fetch a URL and extract text
- Save findings to a file
"""
import anthropic
import json
import re
import sys
import urllib.request
import urllib.parse
from pathlib import Path
from html.parser import HTMLParser

client = anthropic.Anthropic()

# --- Tool: web_search ---
def web_search(query: str, max_results: int = 5) -> list[dict]:
    encoded = urllib.parse.quote(query)
    url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1"
    with urllib.request.urlopen(url, timeout=10) as r:
        data = json.loads(r.read())
    results = []
    if data.get("AbstractText"):
        results.append({"title": data["Heading"], "snippet": data["AbstractText"][:300]})
    for topic in data.get("RelatedTopics", [])[:max_results - 1]:
        if isinstance(topic, dict) and "Text" in topic:
            results.append({"title": topic.get("FirstURL", ""), "snippet": topic["Text"][:200]})
    return results

# --- Tool: fetch_url ---
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self._skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer"):
            self._skip = True
    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer"):
            self._skip = False
    def handle_data(self, data):
        if not self._skip and data.strip():
            self.text_parts.append(data.strip())

def fetch_url(url: str, max_chars: int = 3000) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", errors="ignore")
        parser = TextExtractor()
        parser.feed(html)
        text = " ".join(parser.text_parts)
        return re.sub(r"\s+", " ", text)[:max_chars]
    except Exception as e:
        return f"Error fetching {url}: {e}"

# --- Tool: save_to_file ---
def save_to_file(filename: str, content: str) -> str:
    Path(filename).write_text(content)
    return f"Saved {len(content)} chars to {filename}"

# --- Schema ---
TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for a query. Returns a list of results with titles and snippets.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "Max results (default 5)", "default": 5}
            },
            "required": ["query"]
        }
    },
    {
        "name": "fetch_url",
        "description": "Fetch a URL and return the page text (up to 3000 chars).",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "max_chars": {"type": "integer", "default": 3000}
            },
            "required": ["url"]
        }
    },
    {
        "name": "save_to_file",
        "description": "Save text content to a local file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {"type": "string"},
                "content": {"type": "string"}
            },
            "required": ["filename", "content"]
        }
    }
]

TOOL_MAP = {
    "web_search": lambda i: json.dumps(web_search(i["query"], i.get("max_results", 5))),
    "fetch_url":  lambda i: fetch_url(i["url"], i.get("max_chars", 3000)),
    "save_to_file": lambda i: save_to_file(i["filename"], i["content"]),
}

# --- Agent loop ---
def run_agent(task: str) -> str:
    messages = [{"role": "user", "content": task}]
    system = "You are a research assistant. Use tools to gather information, then synthesize findings. Always save your research summary to a file when asked."

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system,
            tools=TOOLS,
            messages=messages
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            return next((b.text for b in response.content if hasattr(b, "text")), "")

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                print(f"  → {block.name}({list(block.input.values())[0] if block.input else ''})")
                result = TOOL_MAP[block.name](block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
        messages.append({"role": "user", "content": tool_results})

if __name__ == "__main__":
    task = sys.argv[1] if len(sys.argv) > 1 else \
        "Research what the Model Context Protocol (MCP) is and save a 3-paragraph summary to research/mcp-summary.txt"
    Path("research").mkdir(exist_ok=True)
    result = run_agent(task)
    print("\n" + result)
```

---

## Section 5 — The Model Context Protocol (MCP)

### What is MCP?

MCP (Model Context Protocol) is an open standard that lets any AI assistant — Claude, GPT, Gemini — talk to any data source or tool through a **standardized interface**. Think of it like USB-C: one protocol, any device.

```
┌───────────────────────────────────────────────────────────┐
│                     MCP Architecture                      │
│                                                           │
│   ┌──────────────┐         ┌─────────────────────────┐   │
│   │  MCP Client  │◄───────►│      MCP Server         │   │
│   │ (Claude Code │  JSON-  │  (your Python/Node app) │   │
│   │  or IDE)     │  RPC    │                         │   │
│   └──────────────┘         │  Exposes:               │   │
│                             │   • tools (functions)   │   │
│                             │   • resources (data)    │   │
│                             │   • prompts (templates) │   │
│                             └─────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

**Why it matters:** Without MCP, every AI tool needs a custom integration. With MCP, you write a server once and any MCP-compatible client can use it.

Claude Code is already an MCP client — it can connect to MCP servers you define in `.claude/settings.json`.

### MCP Transport Options

| Transport | When to use |
|---|---|
| **stdio** | Local tools — server is a child process, communicates via stdin/stdout |
| **SSE (HTTP)** | Remote servers — served over HTTP, supports multiple clients |

For local development, always start with **stdio** — simplest setup, no network required.

---

## Section 6 — Building Your First MCP Server

### Install the SDK

```bash
pip install mcp
```

### A Minimal MCP Server

```python
# mcp_servers/hello_server.py
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
import asyncio

server = Server("hello-server")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="greet",
            description="Return a greeting for a given name.",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name to greet"}
                },
                "required": ["name"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "greet":
        return [types.TextContent(type="text", text=f"Hello, {arguments['name']}! 👋")]
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
```

### A Real MCP Server: File System + Notes

```python
# mcp_servers/notes_server.py
"""
MCP server that exposes:
  Tools:  create_note, list_notes, read_note, delete_note
  Resources: notes://<title>  (read note content as a resource)
"""
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
import asyncio
import json
from pathlib import Path
from datetime import datetime

NOTES_DIR = Path.home() / ".mcp-notes"
NOTES_DIR.mkdir(exist_ok=True)

server = Server("notes-server")

def note_path(title: str) -> Path:
    safe = title.replace(" ", "_").replace("/", "_")
    return NOTES_DIR / f"{safe}.json"

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="create_note",
            description="Create or update a note with a title and body.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body":  {"type": "string"}
                },
                "required": ["title", "body"]
            }
        ),
        types.Tool(
            name="list_notes",
            description="List all saved note titles.",
            inputSchema={"type": "object", "properties": {}}
        ),
        types.Tool(
            name="read_note",
            description="Read a note by title.",
            inputSchema={
                "type": "object",
                "properties": {"title": {"type": "string"}},
                "required": ["title"]
            }
        ),
        types.Tool(
            name="delete_note",
            description="Delete a note by title.",
            inputSchema={
                "type": "object",
                "properties": {"title": {"type": "string"}},
                "required": ["title"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "create_note":
        path = note_path(arguments["title"])
        data = {"title": arguments["title"], "body": arguments["body"],
                "created": datetime.now().isoformat()}
        path.write_text(json.dumps(data, indent=2))
        return [types.TextContent(type="text", text=f"Note '{arguments['title']}' saved.")]

    elif name == "list_notes":
        titles = [p.stem.replace("_", " ") for p in NOTES_DIR.glob("*.json")]
        if not titles:
            return [types.TextContent(type="text", text="No notes found.")]
        return [types.TextContent(type="text", text="\n".join(f"• {t}" for t in titles))]

    elif name == "read_note":
        path = note_path(arguments["title"])
        if not path.exists():
            return [types.TextContent(type="text", text=f"Note '{arguments['title']}' not found.")]
        data = json.loads(path.read_text())
        return [types.TextContent(type="text", text=f"# {data['title']}\n\n{data['body']}")]

    elif name == "delete_note":
        path = note_path(arguments["title"])
        if path.exists():
            path.unlink()
            return [types.TextContent(type="text", text=f"Deleted '{arguments['title']}'.")]
        return [types.TextContent(type="text", text="Note not found.")]

    raise ValueError(f"Unknown tool: {name}")

@server.list_resources()
async def list_resources() -> list[types.Resource]:
    resources = []
    for path in NOTES_DIR.glob("*.json"):
        data = json.loads(path.read_text())
        resources.append(types.Resource(
            uri=f"notes://{data['title']}",
            name=data["title"],
            mimeType="text/plain"
        ))
    return resources

@server.read_resource()
async def read_resource(uri: str) -> str:
    title = uri.removeprefix("notes://")
    path = note_path(title)
    if not path.exists():
        raise FileNotFoundError(f"Note not found: {title}")
    data = json.loads(path.read_text())
    return data["body"]

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
```

### Wire it up to Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "notes": {
      "command": "python3",
      "args": ["/absolute/path/to/mcp_servers/notes_server.py"],
      "env": {}
    }
  }
}
```

Restart Claude Code — it will launch your MCP server as a child process and the `create_note`, `list_notes`, `read_note`, `delete_note` tools will appear automatically.

### Testing Your MCP Server (without Claude)

```python
# mcp_servers/test_client.py
"""Quick smoke test for the notes server without needing Claude."""
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(
        command="python3",
        args=["mcp_servers/notes_server.py"]
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print("Tools:", [t.name for t in tools.tools])

            # Create a note
            result = await session.call_tool("create_note", {
                "title": "MCP Test",
                "body": "This note was created by the test client."
            })
            print("Create:", result.content[0].text)

            # List notes
            result = await session.call_tool("list_notes", {})
            print("List:", result.content[0].text)

asyncio.run(main())
```

### ▶ Exercise 3: Build a Database MCP Server

```
Build mcp_servers/sqlite_server.py — an MCP server backed by SQLite.

Tools to expose:
1. run_query(sql: str) → execute any SELECT; return rows as JSON array
2. create_table(name: str, columns: list[str]) → CREATE TABLE IF NOT EXISTS
3. insert_row(table: str, data: dict) → INSERT a row
4. list_tables() → show all tables in the database

Use sqlite3 from the Python standard library. Store the database at ~/.mcp-sqlite.db.

Wire it up in .claude/settings.json as "sqlite" server.

Test from Claude Code: "Create a tasks table with columns id, title, done. Insert 3 tasks. Show me all tasks."
```

---

## Section 7 — MCP Resources & Prompts

MCP servers can expose three primitives:

| Primitive | Purpose | Access in Claude |
|---|---|---|
| **Tools** | Functions Claude can call | Claude decides when to call them |
| **Resources** | Read-only data (files, DB rows) | Claude can read on demand |
| **Prompts** | Reusable prompt templates | User can select from a menu |

### Adding a Prompt Template

```python
# Add to notes_server.py

@server.list_prompts()
async def list_prompts() -> list[types.Prompt]:
    return [
        types.Prompt(
            name="summarize_notes",
            description="Summarize all notes into a weekly digest.",
            arguments=[
                types.PromptArgument(
                    name="style",
                    description="Summary style: 'brief' or 'detailed'",
                    required=False
                )
            ]
        )
    ]

@server.get_prompt()
async def get_prompt(name: str, arguments: dict | None) -> types.GetPromptResult:
    if name == "summarize_notes":
        style = (arguments or {}).get("style", "brief")
        return types.GetPromptResult(
            description="Summarize all notes",
            messages=[
                types.PromptMessage(
                    role="user",
                    content=types.TextContent(
                        type="text",
                        text=f"List all my notes and summarize them in a {style} weekly digest format."
                    )
                )
            ]
        )
    raise ValueError(f"Unknown prompt: {name}")
```

---

## Quick Reference

### Agent loop skeleton

```python
messages = [{"role": "user", "content": user_message}]
while True:
    response = client.messages.create(model=..., tools=tools, messages=messages)
    messages.append({"role": "assistant", "content": response.content})
    if response.stop_reason == "end_turn":
        return get_text(response)
    results = [run_tool(b) for b in response.content if b.type == "tool_use"]
    messages.append({"role": "user", "content": results})
```

### Tool result format

```python
{
    "type": "tool_result",
    "tool_use_id": block.id,   # must match the tool_use block
    "content": "string result or JSON string"
}
```

### MCP server minimal structure

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
import asyncio

server = Server("my-server")

@server.list_tools()
async def list_tools(): return [types.Tool(name=..., description=..., inputSchema=...)]

@server.call_tool()
async def call_tool(name, arguments): return [types.TextContent(type="text", text=...)]

asyncio.run(main())  # where main() uses stdio_server()
```

### settings.json MCP entry

```json
{
  "mcpServers": {
    "server-name": {
      "command": "python3",
      "args": ["/absolute/path/to/server.py"],
      "env": { "MY_VAR": "value" }
    }
  }
}
```
