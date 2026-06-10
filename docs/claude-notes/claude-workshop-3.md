# Workshop 3: Running LLMs Locally & Building RAG Pipelines

> **Prerequisites**: Python 3.10+, 8 GB RAM minimum (16 GB recommended for larger models).
> Install Ollama from https://ollama.com — it's a single binary for macOS/Linux/Windows.

---

## Overview: What You'll Build

```
┌──────────────────────────────────────────────────────────────┐
│                 RAG PIPELINE ARCHITECTURE                    │
│                                                              │
│  Your documents                                              │
│       │                                                      │
│       ▼                                                      │
│  ① Chunking → ② Embed → ③ Store in VectorDB                 │
│                                                              │
│  User asks a question                                        │
│       │                                                      │
│       ▼                                                      │
│  ④ Embed question → ⑤ Similarity search → ⑥ Top-K chunks    │
│       │                                                      │
│       ▼                                                      │
│  ⑦ LLM (local or cloud) answers using retrieved context     │
└──────────────────────────────────────────────────────────────┘
```

| Topic | What you'll learn |
|---|---|
| **Ollama** | Install, run, and query local LLMs |
| **Embeddings** | What they are, how to generate them |
| **Vector DB (Chroma)** | Store and query embeddings |
| **RAG pipeline** | Chunk → embed → retrieve → generate |
| **LangChain basics** | Chain, retriever, prompt template primitives |
| **Hybrid search** | Combine semantic + keyword search |

---

## Section 1 — Running LLMs Locally with Ollama

### Why run locally?

- Zero API cost — unlimited inference on your machine
- No internet dependency — works offline
- Data stays local — no sending private documents to cloud
- Experiment freely — swap models in seconds

### Install and First Run

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download installer from https://ollama.com

# Pull a model (this downloads it to ~/.ollama/models)
ollama pull llama3.2          # 2GB — fast, good for most tasks
ollama pull phi4-mini         # 3.8B — excellent reasoning per GB
ollama pull mistral           # 7B — good all-rounder
ollama pull nomic-embed-text  # embedding model (no generation)

# Run interactively
ollama run llama3.2
>>> Why is the sky blue?
```

### Ollama serves an OpenAI-compatible API

```bash
# Ollama runs a local server at http://localhost:11434
# It's OpenAI-compatible — works with any OpenAI SDK

curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2",
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }'
```

### Using the Anthropic SDK style with Ollama

```python
# ollama/01_basic_chat.py
# Use the openai library since Ollama speaks that protocol
from openai import OpenAI

# Point to local Ollama instead of OpenAI's servers
client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"  # required by the SDK but ignored by Ollama
)

response = client.chat.completions.create(
    model="llama3.2",
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "Explain recursion in one sentence."}
    ]
)

print(response.choices[0].message.content)
```

### Ollama's Native Python Library

```python
# ollama/02_native.py
import ollama

# Simple generate
response = ollama.chat(
    model="llama3.2",
    messages=[{"role": "user", "content": "List 3 Python best practices."}]
)
print(response["message"]["content"])

# Streaming
for chunk in ollama.chat(
    model="llama3.2",
    messages=[{"role": "user", "content": "Count to 5 slowly."}],
    stream=True
):
    print(chunk["message"]["content"], end="", flush=True)
print()

# Generate embeddings
embed = ollama.embeddings(model="nomic-embed-text", prompt="Hello world")
print(f"Embedding dimensions: {len(embed['embedding'])}")  # 768
```

### Switching Models in Your Code

```python
# ollama/03_model_switch.py
"""Switch between local Ollama and Claude cloud with one flag."""
import os
import anthropic
from openai import OpenAI

USE_LOCAL = os.getenv("USE_LOCAL", "1") == "1"
LOCAL_MODEL = "llama3.2"
CLOUD_MODEL = "claude-sonnet-4-6"

def complete(prompt: str, system: str = "") -> str:
    if USE_LOCAL:
        client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})
        r = client.chat.completions.create(model=LOCAL_MODEL, messages=msgs)
        return r.choices[0].message.content
    else:
        client = anthropic.Anthropic()
        r = client.messages.create(
            model=CLOUD_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": prompt}]
        )
        return r.content[0].text

print(complete("What is the boiling point of water?", system="Answer in one sentence."))
# USE_LOCAL=0 python3 03_model_switch.py  → uses Claude
```

### Useful Ollama commands

```bash
ollama list                    # show downloaded models
ollama ps                      # show running models (GPU/CPU usage)
ollama show llama3.2           # show model metadata
ollama rm mistral              # remove a model
ollama create my-model -f Modelfile   # create custom model

# Modelfile example — customize system prompt & parameters
cat > Modelfile <<'EOF'
FROM llama3.2
SYSTEM "You are a Python expert who only answers with code."
PARAMETER temperature 0.2
PARAMETER top_p 0.9
EOF
ollama create py-expert -f Modelfile
ollama run py-expert
```

### ▶ Exercise 1

```
Write ollama/chat_benchmark.py that:
1. Accepts a question as sys.argv[1]
2. Sends it to all installed Ollama models (use `ollama list` to find them)
3. Times each response with time.time()
4. Prints a table: model | response_time | first_100_chars_of_answer

Use ollama.list() to get installed models dynamically.
```

---

## Section 2 — Embeddings: Making Text Searchable

### What is an embedding?

An embedding is a list of numbers (a vector) that represents the *meaning* of a piece of text. Two semantically similar sentences will have vectors that are close together in space.

```
"I love cats"           →  [0.21, -0.43, 0.87, ...]   ← 768 numbers
"I adore felines"       →  [0.22, -0.41, 0.85, ...]   ← very similar!
"The sky is blue"       →  [-0.33, 0.91, -0.12, ...]  ← very different
```

**Cosine similarity** measures the angle between two vectors — 1.0 = identical meaning, 0.0 = unrelated, -1.0 = opposite.

### Generate embeddings with Ollama

```python
# rag/01_embeddings.py
import ollama
import numpy as np

def embed(text: str) -> np.ndarray:
    result = ollama.embeddings(model="nomic-embed-text", prompt=text)
    return np.array(result["embedding"])

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# Example: semantic similarity
sentences = [
    "The quick brown fox jumps over the lazy dog.",
    "A fast auburn fox leaped across a sleepy hound.",   # paraphrase
    "Python is a programming language.",                 # unrelated
    "Machine learning requires large datasets.",         # unrelated
]

query = "A swift fox and a dog."
query_vec = embed(query)

print(f"Query: '{query}'\n")
for s in sentences:
    sim = cosine_similarity(query_vec, embed(s))
    bar = "█" * int(sim * 20)
    print(f"  {sim:.3f} {bar:20s}  {s[:60]}")
```

### Cloud embeddings with Claude / OpenAI

```python
# rag/02_cloud_embed.py
# Use OpenAI's text-embedding-3-small (1536 dims) or Voyage AI (for Claude)
from openai import OpenAI

client = OpenAI()  # needs OPENAI_API_KEY

def embed_openai(texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts
    )
    return [item.embedding for item in response.data]

# For Anthropic-native embeddings, use Voyage AI:
# pip install voyageai
# import voyageai
# vo = voyageai.Client()  # needs VOYAGE_API_KEY
# result = vo.embed(texts, model="voyage-3", input_type="document")
```

---

## Section 3 — Vector Databases with Chroma

### What is a vector database?

A vector database stores embeddings and lets you search by similarity — "find me the 5 documents closest in meaning to this query."

```bash
pip install chromadb
```

### Basic Chroma operations

```python
# rag/03_chroma_basics.py
import chromadb

# In-memory (for testing)
client = chromadb.Client()

# Persistent (survives restarts)
# client = chromadb.PersistentClient(path="./chroma_db")

collection = client.create_collection(
    name="my_docs",
    metadata={"hnsw:space": "cosine"}  # use cosine similarity
)

# Add documents — Chroma can auto-embed using a built-in model,
# or you can supply your own embeddings
collection.add(
    documents=[
        "Python is a high-level, interpreted programming language.",
        "JavaScript runs in browsers and on Node.js servers.",
        "Rust provides memory safety without a garbage collector.",
        "Docker containers package apps with their dependencies.",
        "Kubernetes orchestrates containers across clusters.",
    ],
    ids=["doc1", "doc2", "doc3", "doc4", "doc5"]
)

# Query by natural language
results = collection.query(
    query_texts=["what language is good for systems programming?"],
    n_results=2
)

for doc, dist in zip(results["documents"][0], results["distances"][0]):
    print(f"  [{dist:.3f}] {doc}")
```

### Chroma with custom embeddings (Ollama)

```python
# rag/04_chroma_ollama.py
import chromadb
import ollama
from chromadb import EmbeddingFunction

class OllamaEmbedder(EmbeddingFunction):
    def __init__(self, model: str = "nomic-embed-text"):
        self.model = model

    def __call__(self, input: list[str]) -> list[list[float]]:
        return [
            ollama.embeddings(model=self.model, prompt=text)["embedding"]
            for text in input
        ]

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(
    name="notes",
    embedding_function=OllamaEmbedder()
)

# Add documents
collection.add(
    documents=["Meeting notes: discussed Q3 roadmap and budget.", 
               "Recipe: pasta with tomato sauce takes 20 minutes."],
    ids=["note1", "note2"]
)

# Query
results = collection.query(query_texts=["project planning"], n_results=1)
print(results["documents"][0][0])
```

---

## Section 4 — Building a Full RAG Pipeline

### The 5-step process

```
① Read raw documents (PDF, markdown, txt, web pages)
② Split into chunks (300-500 tokens with overlap)
③ Embed each chunk and store in Chroma
④ At query time: embed question, find top-K chunks
⑤ Build a prompt: "Answer based on context: [chunks]\n\nQuestion: [q]"
```

### Step ①②: Document loading and chunking

```python
# rag/05_rag_pipeline.py
import re
from pathlib import Path
from dataclasses import dataclass

@dataclass
class Chunk:
    text: str
    source: str
    chunk_id: int

def load_text_file(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")

def load_markdown_dir(directory: str) -> list[tuple[str, str]]:
    """Returns list of (filename, content) tuples."""
    docs = []
    for p in Path(directory).rglob("*.md"):
        docs.append((str(p), p.read_text(encoding="utf-8")))
    return docs

def chunk_text(text: str, source: str,
               chunk_size: int = 400,
               overlap: int = 50) -> list[Chunk]:
    """Split text into overlapping chunks by word count."""
    words = text.split()
    chunks = []
    start = 0
    chunk_id = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_text = " ".join(words[start:end])
        chunks.append(Chunk(text=chunk_text, source=source, chunk_id=chunk_id))
        chunk_id += 1
        start += chunk_size - overlap
    return chunks
```

### Step ③: Build the index

```python
# rag/05_rag_pipeline.py (continued)
import chromadb
import ollama

def build_index(docs_dir: str, collection_name: str = "rag_index") -> chromadb.Collection:
    client = chromadb.PersistentClient(path="./chroma_db")

    # Reset existing collection
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    collection = client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"}
    )

    all_chunks: list[Chunk] = []
    for source, text in load_markdown_dir(docs_dir):
        all_chunks.extend(chunk_text(text, source))

    print(f"Indexing {len(all_chunks)} chunks from {docs_dir}...")

    # Batch embed to avoid rate limits
    BATCH = 20
    for i in range(0, len(all_chunks), BATCH):
        batch = all_chunks[i:i + BATCH]
        embeddings = [
            ollama.embeddings(model="nomic-embed-text", prompt=c.text)["embedding"]
            for c in batch
        ]
        collection.add(
            ids=[f"{c.source}::{c.chunk_id}" for c in batch],
            documents=[c.text for c in batch],
            embeddings=embeddings,
            metadatas=[{"source": c.source, "chunk_id": c.chunk_id} for c in batch]
        )
        print(f"  {min(i + BATCH, len(all_chunks))}/{len(all_chunks)}", end="\r")

    print(f"\nIndex built: {len(all_chunks)} chunks stored.")
    return collection
```

### Step ④⑤: Query and generate

```python
# rag/05_rag_pipeline.py (continued)
def retrieve(collection: chromadb.Collection, question: str, k: int = 5) -> list[str]:
    q_embed = ollama.embeddings(model="nomic-embed-text", prompt=question)["embedding"]
    results = collection.query(query_embeddings=[q_embed], n_results=k)
    chunks = results["documents"][0]
    sources = [m["source"] for m in results["metadatas"][0]]
    return chunks, sources

def answer(question: str, chunks: list[str], model: str = "llama3.2") -> str:
    context = "\n\n---\n\n".join(chunks)
    prompt = f"""Answer the question below using ONLY the context provided.
If the answer is not in the context, say "I don't have information about that."

Context:
{context}

Question: {question}

Answer:"""
    response = ollama.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    return response["message"]["content"]

# --- Main CLI ---
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python3 rag/05_rag_pipeline.py <docs_dir> [question]")
        sys.exit(1)

    docs_dir = sys.argv[1]
    collection = build_index(docs_dir)

    if len(sys.argv) >= 3:
        question = sys.argv[2]
    else:
        question = input("\nAsk a question: ")

    chunks, sources = retrieve(collection, question)
    print(f"\n[Retrieved {len(chunks)} chunks from: {set(sources)}]\n")
    print(answer(question, chunks))
```

**Usage:**
```bash
# Index your docs/ folder and ask a question
python3 rag/05_rag_pipeline.py docs/ "How do I add a new document to the site?"
```

### Chunk size matters

| Chunk size | Pros | Cons |
|---|---|---|
| Small (100–200 tokens) | Precise retrieval, less noise | May split context mid-sentence |
| Medium (300–500 tokens) | Good balance | Sweet spot for most use cases |
| Large (800–1200 tokens) | Full context preserved | More noise, less precise matching |

Always include 50-100 token overlap between chunks so sentences at boundaries aren't lost.

---

## Section 5 — LangChain Basics

### Why LangChain?

LangChain provides reusable abstractions for the most common LLM patterns: chains, retrievers, prompt templates, document loaders. It's not required, but it reduces boilerplate.

```bash
pip install langchain langchain-community langchain-ollama chromadb
```

### Document Loading and Splitting

```python
# langchain/01_basics.py
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Load all .md files
loader = DirectoryLoader("docs/", glob="**/*.md", loader_cls=TextLoader)
documents = loader.load()
print(f"Loaded {len(documents)} documents")

# Split into chunks
splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    separators=["\n\n", "\n", " ", ""]  # tries these in order
)
chunks = splitter.split_documents(documents)
print(f"Split into {len(chunks)} chunks")
# Each chunk has: chunk.page_content (text), chunk.metadata (source, etc.)
```

### LangChain RAG Chain

```python
# langchain/02_rag_chain.py
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# Build vector store
embeddings = OllamaEmbeddings(model="nomic-embed-text")
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_langchain"
)

# Build retrieval chain
llm = ChatOllama(model="llama3.2", temperature=0)

prompt = PromptTemplate(
    input_variables=["context", "question"],
    template="""Use the context below to answer the question.
If unsure, say "I don't know."

Context: {context}

Question: {question}
Answer:"""
)

qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=vectorstore.as_retriever(search_kwargs={"k": 4}),
    chain_type_kwargs={"prompt": prompt},
    return_source_documents=True
)

result = qa_chain.invoke({"query": "What is this project about?"})
print(result["result"])
print("\nSources:")
for doc in result["source_documents"]:
    print(f"  {doc.metadata['source']}")
```

### LangGraph: Stateful Agent Workflows

LangGraph extends LangChain for building agents as directed graphs:

```python
# langchain/03_langgraph_agent.py
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, AIMessage

# pip install langgraph

class AgentState(TypedDict):
    messages: list
    next_step: str

llm = ChatOllama(model="llama3.2")

def should_continue(state: AgentState) -> str:
    """Router: decides if we need more tool calls or are done."""
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "tools"
    return END

def call_model(state: AgentState) -> AgentState:
    response = llm.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

# Build the graph
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)

app = workflow.compile()

# Run it
result = app.invoke({
    "messages": [HumanMessage(content="Explain what a neural network is.")],
    "next_step": "agent"
})
print(result["messages"][-1].content)
```

---

## Section 6 — Hybrid Search

Pure semantic (vector) search misses exact keyword matches. Hybrid search combines both:

```
Hybrid score = α × semantic_score + (1 - α) × keyword_score
```

```python
# rag/06_hybrid_search.py
"""
Hybrid search combining:
- Dense retrieval: Chroma + nomic-embed-text (semantic)
- Sparse retrieval: BM25 (keyword)
"""
from rank_bm25 import BM25Okapi   # pip install rank-bm25
import chromadb
import ollama
import numpy as np

class HybridRetriever:
    def __init__(self, documents: list[str], ids: list[str]):
        self.documents = documents
        self.ids = ids

        # BM25 index (keyword)
        tokenized = [doc.lower().split() for doc in documents]
        self.bm25 = BM25Okapi(tokenized)

        # Chroma (semantic)
        self.chroma = chromadb.Client()
        self.collection = self.chroma.create_collection("hybrid")
        embeddings = [
            ollama.embeddings(model="nomic-embed-text", prompt=d)["embedding"]
            for d in documents
        ]
        self.collection.add(documents=documents, ids=ids, embeddings=embeddings)

    def search(self, query: str, k: int = 5, alpha: float = 0.5) -> list[str]:
        # BM25 scores (keyword)
        bm25_scores = self.bm25.get_scores(query.lower().split())
        bm25_norm = bm25_scores / (bm25_scores.max() + 1e-9)

        # Chroma scores (semantic)
        q_embed = ollama.embeddings(model="nomic-embed-text", prompt=query)["embedding"]
        results = self.collection.query(
            query_embeddings=[q_embed],
            n_results=len(self.documents)
        )
        sem_scores = np.zeros(len(self.documents))
        for i, doc_id in enumerate(results["ids"][0]):
            idx = self.ids.index(doc_id)
            sem_scores[idx] = 1 - results["distances"][0][i]  # distance → similarity

        # Combine
        combined = alpha * sem_scores + (1 - alpha) * bm25_norm
        top_k = np.argsort(combined)[::-1][:k]
        return [self.documents[i] for i in top_k]

# Usage
docs = [
    "Python is great for data science and machine learning.",
    "The Eiffel Tower is 330 meters tall.",
    "Neural networks learn by adjusting weights.",
    "Paris is the capital of France.",
    "Gradient descent minimizes the loss function.",
]
retriever = HybridRetriever(docs, [f"d{i}" for i in range(len(docs))])

for q in ["deep learning optimization", "Paris tourist landmark"]:
    print(f"\nQuery: '{q}'")
    for r in retriever.search(q, k=2):
        print(f"  → {r}")
```

---

## Section 7 — Putting It Together: Document Q&A App

### ▶ Final Exercise: Build a Full RAG App

```
Build rag/qa_app.py — a command-line Q&A app over your own documents.

Requirements:
1. Accept a docs directory and question as CLI arguments:
   python3 rag/qa_app.py docs/ "What topics are covered in Workshop 1?"

2. Use a persistent Chroma index (rebuild only if --reindex flag is passed)

3. Chunking strategy:
   - Split markdown at ## headings first (structural chunks)
   - Then split by size (400 words, 50-word overlap)
   - Store heading in metadata["section"]

4. Retrieval:
   - Embed the question with nomic-embed-text
   - Retrieve top-5 chunks
   - Show source filename and section for each retrieved chunk

5. Generation:
   - Use llama3.2 (or llama3.1 if available)
   - Prompt: "Answer strictly from the context. Cite sources."
   - If no relevant chunks found (all distances > 0.8), say "Not found in docs."

6. Bonus: add --model flag to switch between llama3.2 and phi4-mini

Test with: python3 rag/qa_app.py docs/ "What is a Hook in Claude Code?"
Expected: Should find and cite Workshop 1.
```

---

## Quick Reference

### Ollama commands

```bash
ollama pull <model>     # download
ollama run <model>      # interactive chat
ollama list             # installed models
ollama ps               # running models
ollama serve            # start API server manually (auto-started on install)

# API endpoints
POST http://localhost:11434/v1/chat/completions   # OpenAI-compatible
POST http://localhost:11434/api/embeddings        # native
```

### Embedding models comparison

| Model | Dimensions | Best for |
|---|---|---|
| `nomic-embed-text` (Ollama) | 768 | General text, local/free |
| `mxbai-embed-large` (Ollama) | 1024 | High quality local |
| `text-embedding-3-small` (OpenAI) | 1536 | Production, fast |
| `voyage-3` (Voyage AI) | 1024 | Best for Claude RAG |

### RAG prompt template

```python
RAG_PROMPT = """Answer the question using ONLY the context below.
If the answer is not in the context, say "I don't know."
Cite the source document when possible.

Context:
{context}

Question: {question}

Answer:"""
```

### Chroma quick ops

```python
client = chromadb.PersistentClient(path="./db")
col = client.get_or_create_collection("name")
col.add(documents=[...], ids=[...], embeddings=[...])
col.query(query_embeddings=[...], n_results=5)
col.delete(ids=["id1", "id2"])
col.count()
```
