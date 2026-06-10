# Concepts 
- AI Agent 
- Tools 
- MCP Server 
- Skills 
- Hooks

# Frameworks  
- Langchain 
- Crew AI? 

# Tools 
- Claude code 
- LiteLLM 
- Llama CLI  
- ollama 
- UV – New python package manager. 

# Claude Code: 
- /commands 
- Workflow 
- Tool 
- Skill 
- Hooks 

Workshop 2 — Building AI Agents & MCP Servers
- Anthropic SDK (chat, streaming, multi-turn)
- Tool use / function calling with the full request-response cycle
- The agentic while-loop pattern
- A multi-tool research agent (web search + fetch + save)
- MCP protocol overview + building a full notes MCP server (tools + resources + prompts)
- Wiring the server into Claude Code via settings.json

Workshop 3 — Running LLMs Locally & RAG Pipelines
- Ollama install, pull, run — local inference with zero API cost
- Switching between local Ollama and Claude cloud
- Embeddings + cosine similarity from scratch
- Chroma vector database (in-memory and persistent)
- Full RAG pipeline: chunking → embed → store → retrieve → generate
- LangChain + LangGraph basics
- Hybrid search (BM25 + semantic combined)

Workshop 4 — Production AI: Prompt Engineering, Evals, Fine-tuning & Deployment
- Prompt patterns: chain-of-thought, few-shot, prompt versioning
- Structured outputs via tool_use + Pydantic/instructor
- Eval harness with exact-match, contains, and LLM-as-judge scorers
- LoRA fine-tuning with HuggingFace PEFT on a 16 GB GPU
- vLLM inference server + model routing (local vs cloud)
- Prompt caching, batch API, token counting for cost control
- Multi-modal: Claude Vision, Whisper transcription, voice pipeline