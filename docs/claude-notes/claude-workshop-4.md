# Workshop 4: Production AI — Prompt Engineering, Evals, Fine-Tuning & Deployment

> **Prerequisites**: Python 3.10+, familiarity with the Anthropic SDK (Workshop 2).
> Some sections require GPU access; alternatives are noted where possible.

---

## Overview

```
┌──────────────────────────────────────────────────────────────────┐
│           FROM PROTOTYPE TO PRODUCTION                           │
│                                                                  │
│  Prototype                Production                             │
│  ─────────                ──────────                             │
│  "just works"     →       reliable, measurable, cost-aware       │
│  manual testing   →       automated evals                        │
│  big prompts      →       engineered, versioned prompts          │
│  cloud only       →       fine-tuned or locally-served models    │
│  no metrics       →       latency, cost, quality tracked         │
└──────────────────────────────────────────────────────────────────┘
```

| Topic | What you'll learn |
|---|---|
| **Prompt Engineering** | Chain-of-thought, few-shot, structured output patterns |
| **Structured Outputs** | JSON mode, Pydantic models, tool-use for extraction |
| **LLM Evals** | Build automated test suites for LLM quality |
| **Fine-tuning with LoRA** | Adapt a model on custom data without full retraining |
| **Model Serving** | vLLM, Ollama as production inference server |
| **Cost Optimization** | Prompt caching, batching, model routing |
| **Multi-modal AI** | Images with Claude Vision, audio with Whisper |

---

## Section 1 — Prompt Engineering Patterns

### 1.1 Chain-of-Thought (CoT)

Adding "think step by step" dramatically improves reasoning accuracy on complex problems:

```python
# prompts/01_cot.py
import anthropic

client = anthropic.Anthropic()

def solve_with_cot(problem: str) -> str:
    return client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": f"{problem}\n\nThink step by step before giving your final answer."
        }]
    ).content[0].text

# Compare with and without CoT
problem = "A store sells apples for $0.50 each and oranges for $0.75 each. \
If I buy 12 apples and 8 oranges, and pay with a $20 bill, how much change do I get?"

print(solve_with_cot(problem))
# → Step 1: Cost of apples = 12 × $0.50 = $6.00 ...
# → Change = $20.00 - $12.00 = $8.00
```

**Extended Thinking** (Claude-specific): for harder problems, enable Claude's internal reasoning:

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000   # how much "thinking space" to allocate
    },
    messages=[{"role": "user", "content": problem}]
)
# response.content has: [ThinkingBlock, TextBlock]
thinking = response.content[0].thinking  # internal reasoning
answer   = response.content[1].text      # final answer
```

### 1.2 Few-Shot Prompting

Showing examples is more reliable than describing the format:

```python
# prompts/02_few_shot.py
FEW_SHOT_SYSTEM = """You classify customer support tickets into categories.
Categories: billing, technical, shipping, refund, other

Examples:
Input: "My credit card was charged twice for the same order"
Output: billing

Input: "The app crashes when I open it on iPhone 15"
Output: technical

Input: "Where is my package? Order #12345 was supposed to arrive yesterday"
Output: shipping"""

def classify_ticket(ticket: str) -> str:
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",   # use faster/cheaper model for classification
        max_tokens=10,
        system=FEW_SHOT_SYSTEM,
        messages=[{"role": "user", "content": f"Input: {ticket}\nOutput:"}]
    )
    return response.content[0].text.strip()

tickets = [
    "I want a refund for my broken headphones",
    "Can't log in — says invalid password but I just reset it",
    "My order shipped to the wrong address",
]
for t in tickets:
    print(f"{classify_ticket(t):12s}  →  {t}")
```

### 1.3 Prompt Templates and Versioning

Never hardcode prompts inline. Version them like code:

```python
# prompts/templates.py
from string import Template
from pathlib import Path
import json

PROMPTS_DIR = Path("prompts/versions")
PROMPTS_DIR.mkdir(parents=True, exist_ok=True)

def save_prompt(name: str, version: str, system: str, user_template: str):
    path = PROMPTS_DIR / f"{name}_v{version}.json"
    path.write_text(json.dumps({
        "name": name, "version": version,
        "system": system, "user_template": user_template
    }, indent=2))

def load_prompt(name: str, version: str = "latest") -> dict:
    if version == "latest":
        files = sorted(PROMPTS_DIR.glob(f"{name}_v*.json"))
        if not files:
            raise FileNotFoundError(f"No prompt found for {name}")
        path = files[-1]
    else:
        path = PROMPTS_DIR / f"{name}_v{version}.json"
    return json.loads(path.read_text())

def render_prompt(name: str, version: str = "latest", **kwargs) -> tuple[str, str]:
    p = load_prompt(name, version)
    system = p["system"]
    user = Template(p["user_template"]).substitute(**kwargs)
    return system, user

# Save a prompt version
save_prompt(
    name="summarize",
    version="1.0",
    system="You are a document summarizer. Be concise and factual.",
    user_template="Summarize the following in $max_sentences sentences:\n\n$text"
)

# Use it
system, user = render_prompt("summarize", text="Long article...", max_sentences="3")
```

### 1.4 Prompt Anti-Patterns to Avoid

| Anti-pattern | Problem | Fix |
|---|---|---|
| `"Do X, Y, and Z and also A, B, C..."` | Instruction overflow — Claude drops later items | One task per prompt; use tools for multi-step |
| `"Respond in JSON"` without schema | Inconsistent structure, hard to parse | Give exact JSON schema or use structured output |
| `"Be helpful, harmless, and honest"` | Vague — every prompt should assume this | Write specific behavioral constraints |
| Very long system prompt | Costs tokens every request; slow | Use prompt caching (see Section 6) |
| `"Never say X"` negative instructions | LLMs handle negatives poorly | Restate as positive: "Always respond with Y" |

---

## Section 2 — Structured Outputs

Getting reliable JSON from LLMs is a core production skill.

### Method 1: Tool Use (most reliable)

Define a tool whose only purpose is to return structured data:

```python
# structured/01_tool_extraction.py
import anthropic
import json

client = anthropic.Anthropic()

# Define a schema as a "tool"
EXTRACT_TOOL = {
    "name": "extract_person",
    "description": "Extract structured person data from text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name":       {"type": "string"},
            "age":        {"type": "integer"},
            "email":      {"type": "string"},
            "occupation": {"type": "string"}
        },
        "required": ["name"]
    }
}

def extract_person(text: str) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        tools=[EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_person"},  # force tool use
        messages=[{"role": "user", "content": f"Extract person info from: {text}"}]
    )
    tool_use = next(b for b in response.content if b.type == "tool_use")
    return tool_use.input

text = "John Smith, 34, is a software engineer who can be reached at john@example.com"
person = extract_person(text)
print(json.dumps(person, indent=2))
# { "name": "John Smith", "age": 34, "email": "john@example.com", "occupation": "software engineer" }
```

### Method 2: Pydantic + instructor

```python
# structured/02_pydantic.py
# pip install instructor pydantic
import instructor
import anthropic
from pydantic import BaseModel, Field
from typing import Optional

client = instructor.from_anthropic(anthropic.Anthropic())

class Person(BaseModel):
    name: str
    age: Optional[int] = None
    email: Optional[str] = None
    occupation: Optional[str] = None

class MeetingNotes(BaseModel):
    date: str = Field(description="Meeting date in YYYY-MM-DD format")
    attendees: list[str]
    action_items: list[str]
    summary: str = Field(max_length=200)

def parse_meeting(notes: str) -> MeetingNotes:
    return client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"Extract meeting info:\n\n{notes}"}],
        response_model=MeetingNotes   # instructor handles the rest
    )

notes = """
Meeting on June 5th 2026. Present: Alice, Bob, Carol.
Alice will write the spec by Friday. Bob needs to fix the login bug.
Carol will schedule the client demo. We discussed the Q3 roadmap.
"""
meeting = parse_meeting(notes)
print(meeting.model_dump_json(indent=2))
```

---

## Section 3 — LLM Evaluation (Evals)

### Why Evals Matter

Without evals, you don't know if a prompt change made things better or worse. Evals let you:
- Catch regressions before deploying prompt changes
- Measure quality objectively, not by vibes
- A/B test models or prompts at scale

### Three types of evals

| Type | How it works | When to use |
|---|---|---|
| **Exact match** | Output == expected string | Classification, extraction |
| **Contains** | Output contains key phrases | Summarization, Q&A |
| **LLM-as-judge** | Another LLM rates the output | Open-ended generation |

### Building an eval harness

```python
# evals/harness.py
import json
import time
import anthropic
from dataclasses import dataclass, field
from typing import Callable

@dataclass
class EvalCase:
    id: str
    input: str
    expected: str
    tags: list[str] = field(default_factory=list)

@dataclass
class EvalResult:
    case_id: str
    passed: bool
    score: float       # 0.0 – 1.0
    latency_ms: float
    output: str
    reason: str = ""

def run_evals(
    cases: list[EvalCase],
    model_fn: Callable[[str], str],
    scorer: Callable[[str, str], tuple[bool, float, str]],
    label: str = "eval"
) -> list[EvalResult]:
    results = []
    for case in cases:
        t0 = time.time()
        output = model_fn(case.input)
        latency = (time.time() - t0) * 1000
        passed, score, reason = scorer(output, case.expected)
        results.append(EvalResult(
            case_id=case.id,
            passed=passed,
            score=score,
            latency_ms=latency,
            output=output,
            reason=reason
        ))
        icon = "✓" if passed else "✗"
        print(f"  {icon} [{case.id}] score={score:.2f} latency={latency:.0f}ms")

    passed = sum(1 for r in results if r.passed)
    avg_score = sum(r.score for r in results) / len(results)
    avg_latency = sum(r.latency_ms for r in results) / len(results)
    print(f"\n{label}: {passed}/{len(results)} passed | avg_score={avg_score:.2f} | avg_latency={avg_latency:.0f}ms")
    return results
```

### Exact-match scorer (for classification)

```python
# evals/scorers.py
def exact_match(output: str, expected: str) -> tuple[bool, float, str]:
    clean = output.strip().lower()
    exp = expected.strip().lower()
    passed = clean == exp
    return passed, 1.0 if passed else 0.0, ""

def contains_all(output: str, expected: str) -> tuple[bool, float, str]:
    """Expected is a comma-separated list of required phrases."""
    phrases = [p.strip() for p in expected.split(",")]
    hits = [p for p in phrases if p.lower() in output.lower()]
    score = len(hits) / len(phrases)
    return score == 1.0, score, f"missing: {set(phrases) - set(hits)}"
```

### LLM-as-judge scorer

```python
# evals/scorers.py (continued)
def llm_judge(output: str, expected: str, criterion: str = "accuracy") -> tuple[bool, float, str]:
    """Use Claude to rate output quality."""
    import anthropic
    client = anthropic.Anthropic()

    prompt = f"""Rate the following response on {criterion} from 0 to 10.
Expected answer: {expected}
Actual response: {output}

Respond with ONLY a JSON object: {{"score": <int 0-10>, "reason": "<one sentence>"}}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}]
    )
    import json
    data = json.loads(response.content[0].text)
    score = data["score"] / 10.0
    return score >= 0.7, score, data["reason"]
```

### Running a classification eval

```python
# evals/run_classification_eval.py
from harness import EvalCase, run_evals
from scorers import exact_match
import anthropic

client = anthropic.Anthropic()

def classify(text: str) -> str:
    return client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        system="Classify as: positive, negative, or neutral. Respond with ONE word.",
        messages=[{"role": "user", "content": text}]
    ).content[0].text.strip().lower()

cases = [
    EvalCase("s1", "I absolutely love this product!", "positive"),
    EvalCase("s2", "Worst purchase I've ever made.", "negative"),
    EvalCase("s3", "It arrived on Tuesday.", "neutral"),
    EvalCase("s4", "The quality is disappointing.", "negative"),
    EvalCase("s5", "Pretty good for the price.", "positive"),
]

run_evals(cases, classify, exact_match, label="sentiment-eval")
```

### ▶ Exercise: Build an eval suite

```
Create evals/rag_eval.py — an eval suite for a RAG pipeline.

Test cases: create 10 question-answer pairs based on your docs/ folder.
Each case: {"question": "...", "expected_keywords": "keyword1, keyword2, keyword3"}

Scorer: contains_all — check that the answer contains all expected keywords.

Also measure retrieval quality separately:
- For each question, check that the correct source document was in top-3 results
- Report: answer_pass_rate, retrieval_hit_rate

Store results as JSON in evals/results/<timestamp>.json for trend tracking.
```

---

## Section 4 — Fine-Tuning with LoRA

### What is fine-tuning?

Fine-tuning adapts a pretrained model to a specific task or style by continuing training on your data. **LoRA** (Low-Rank Adaptation) makes this feasible on a single GPU by training only a small set of adapter weights.

```
Full fine-tuning: update all 7B parameters (requires 80GB+ GPU)
LoRA:             update ~0.1% of parameters (fits on 8-16GB GPU)
```

### Setup

```bash
pip install transformers peft datasets accelerate bitsandbytes torch
```

### Prepare your dataset

```python
# finetune/01_prepare_data.py
"""
Format training data as instruction-following pairs.
Save as JSONL — one JSON object per line.
"""
import json
from pathlib import Path

# Each sample: instruction → response
samples = [
    {"instruction": "Summarize this in one sentence.", "input": "Long text...", "response": "Summary."},
    {"instruction": "Translate to French.", "input": "Hello, world!", "response": "Bonjour, monde!"},
    # ... add 100+ samples for meaningful improvement
]

# Format in Alpaca style (common for instruction tuning)
def format_sample(s: dict) -> str:
    if s.get("input"):
        return f"### Instruction:\n{s['instruction']}\n\n### Input:\n{s['input']}\n\n### Response:\n{s['response']}"
    return f"### Instruction:\n{s['instruction']}\n\n### Response:\n{s['response']}"

Path("finetune/data").mkdir(parents=True, exist_ok=True)
with open("finetune/data/train.jsonl", "w") as f:
    for s in samples:
        f.write(json.dumps({"text": format_sample(s)}) + "\n")

print(f"Saved {len(samples)} training samples.")
```

### LoRA Fine-Tuning Script

```python
# finetune/02_train_lora.py
"""
Fine-tune a small model with LoRA using HuggingFace PEFT.
Works on a 16GB GPU (T4/RTX 3090) with 4-bit quantization.
"""
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments, Trainer
from transformers import DataCollatorForLanguageModeling
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset

# --- Config ---
BASE_MODEL = "microsoft/phi-2"   # 2.7B — small enough for local training
OUTPUT_DIR = "finetune/output"
DATASET    = "finetune/data/train.jsonl"

# --- Load tokenizer and model ---
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    torch_dtype=torch.float16,
    device_map="auto",
    load_in_4bit=True,          # 4-bit quantization via bitsandbytes
    trust_remote_code=True
)

# --- Apply LoRA ---
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,               # rank — higher = more capacity, more memory
    lora_alpha=32,      # scaling factor
    lora_dropout=0.1,
    target_modules=["q_proj", "v_proj"],  # which layers to adapt
    bias="none"
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# → trainable params: 4,194,304 || all params: 2,783,936,512 || trainable: 0.15%

# --- Dataset ---
def tokenize(sample):
    tokens = tokenizer(sample["text"], truncation=True, max_length=512, padding="max_length")
    tokens["labels"] = tokens["input_ids"].copy()
    return tokens

dataset = load_dataset("json", data_files=DATASET, split="train")
tokenized = dataset.map(tokenize, remove_columns=["text"])

# --- Training ---
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_strategy="epoch",
    warmup_ratio=0.05,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized,
    data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False)
)
trainer.train()
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print("Fine-tuning complete.")
```

### Running your fine-tuned model

```python
# finetune/03_inference.py
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel
import torch

base = "microsoft/phi-2"
adapter = "finetune/output"

tokenizer = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.float16, device_map="auto")
model = PeftModel.from_pretrained(model, adapter)
model.eval()

def generate(prompt: str) -> str:
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=200,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    return tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

print(generate("### Instruction:\nSummarize this in one sentence.\n\n### Input:\nLong text...\n\n### Response:\n"))
```

### No GPU? Use Google Colab or Modal

```python
# Run on Modal.com (free tier available)
# pip install modal

import modal

app = modal.App("lora-finetune")
image = modal.Image.debian_slim().pip_install("transformers", "peft", "datasets", "torch")

@app.function(gpu="T4", image=image, timeout=3600)
def train():
    # paste finetune/02_train_lora.py body here
    pass

@app.local_entrypoint()
def main():
    train.remote()
```

---

## Section 5 — Model Serving with vLLM

### What is vLLM?

vLLM is a high-throughput inference engine for LLMs. It's 10–24x faster than HuggingFace naive inference through PagedAttention and continuous batching.

```bash
pip install vllm

# Serve a model (requires NVIDIA GPU)
python -m vllm.entrypoints.openai.api_server \
  --model microsoft/phi-2 \
  --port 8000 \
  --max-model-len 2048
```

### Query vLLM like OpenAI

```python
# serving/01_vllm_client.py
from openai import OpenAI

# Point to your vLLM server
client = OpenAI(base_url="http://localhost:8000/v1", api_key="vllm")

response = client.chat.completions.create(
    model="microsoft/phi-2",
    messages=[{"role": "user", "content": "Explain transformers in 3 bullet points."}],
    max_tokens=256
)
print(response.choices[0].message.content)

# Check server metrics
import httpx
metrics = httpx.get("http://localhost:8000/metrics").text
# → Prometheus metrics: vllm:num_requests_running, vllm:gpu_cache_usage, etc.
```

### Routing: local vs cloud

```python
# serving/02_router.py
"""Route requests to local vLLM or Claude based on task complexity."""
import anthropic
from openai import OpenAI

def route_and_complete(prompt: str, complexity: str = "auto") -> str:
    """
    simple/auto → use local vLLM (fast, free)
    complex     → use Claude (more capable, costs tokens)
    """
    if complexity == "auto":
        # Simple heuristic: short prompts → local, long → cloud
        complexity = "simple" if len(prompt.split()) < 100 else "complex"

    if complexity == "simple":
        local = OpenAI(base_url="http://localhost:8000/v1", api_key="vllm")
        r = local.chat.completions.create(
            model="microsoft/phi-2",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512
        )
        return r.choices[0].message.content
    else:
        cloud = anthropic.Anthropic()
        r = cloud.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return r.content[0].text
```

---

## Section 6 — Cost Optimization

### 6.1 Prompt Caching (Claude)

If your system prompt is long and repeated across requests, prompt caching saves 90% on input tokens:

```python
# cost/01_prompt_caching.py
import anthropic

client = anthropic.Anthropic()

LONG_SYSTEM = "..." * 500  # imagine a 2000-word system prompt

# Without caching: pays for LONG_SYSTEM on every request
# With caching: pays full price once, then 10% for subsequent requests within 5 minutes

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_SYSTEM,
            "cache_control": {"type": "ephemeral"}  # mark for caching
        }
    ],
    messages=[{"role": "user", "content": "First question..."}]
)

# Check cache performance
usage = response.usage
print(f"Input tokens:        {usage.input_tokens}")
print(f"Cache write tokens:  {usage.cache_creation_input_tokens}")   # charged at 1.25x
print(f"Cache read tokens:   {usage.cache_read_input_tokens}")       # charged at 0.1x
```

### 6.2 Batch API

For offline workloads (not user-facing), use the batch API for 50% discount:

```python
# cost/02_batch.py
import anthropic
import json

client = anthropic.Anthropic()

# Prepare requests
requests = [
    {
        "custom_id": f"req-{i}",
        "params": {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 100,
            "messages": [{"role": "user", "content": f"Classify sentiment: '{text}'"}]
        }
    }
    for i, text in enumerate(["Great product!", "Broken on arrival.", "It's okay."])
]

# Submit batch
batch = client.beta.messages.batches.create(requests=requests)
print(f"Batch ID: {batch.id}")
print(f"Status: {batch.processing_status}")

# Poll until done (typically minutes for small batches)
import time
while True:
    batch = client.beta.messages.batches.retrieve(batch.id)
    if batch.processing_status == "ended":
        break
    print(f"  {batch.request_counts}")
    time.sleep(30)

# Read results
for result in client.beta.messages.batches.results(batch.id):
    if result.result.type == "succeeded":
        text = result.result.message.content[0].text
        print(f"  [{result.custom_id}] {text.strip()}")
```

### 6.3 Model selection by task

| Task | Recommended model | Why |
|---|---|---|
| Classification, extraction | `claude-haiku-4-5-20251001` | Fast, cheap, accurate for structured tasks |
| Summarization, Q&A | `claude-sonnet-4-6` | Good balance of quality and cost |
| Complex reasoning, code | `claude-opus-4-8` | Best quality for hard tasks |
| Local, free | `llama3.2` via Ollama | Zero API cost |
| Fast local (small) | `phi4-mini` via Ollama | Excellent reasoning/size ratio |

### 6.4 Token counting before sending

```python
# cost/03_token_count.py
import anthropic

client = anthropic.Anthropic()

messages = [{"role": "user", "content": "Explain quantum computing."}]

# Count tokens WITHOUT making a real API call
count = client.messages.count_tokens(
    model="claude-sonnet-4-6",
    messages=messages
)
print(f"Input tokens: {count.input_tokens}")

# Estimate cost (claude-sonnet-4-6 pricing: $3 / 1M input tokens)
cost_usd = count.input_tokens / 1_000_000 * 3
print(f"Estimated cost: ${cost_usd:.6f}")
```

---

## Section 7 — Multi-modal AI

### 7.1 Claude Vision

```python
# multimodal/01_vision.py
import anthropic
import base64
from pathlib import Path

client = anthropic.Anthropic()

def analyze_image(image_path: str, question: str) -> str:
    image_data = base64.standard_b64encode(Path(image_path).read_bytes()).decode()
    ext = Path(image_path).suffix.lstrip(".")
    media_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                  "png": "image/png", "gif": "image/gif",
                  "webp": "image/webp"}.get(ext, "image/png")

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_data}},
                {"type": "text", "text": question}
            ]
        }]
    )
    return response.content[0].text

# Use with a URL instead of file
def analyze_url(url: str, question: str) -> str:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "url", "url": url}},
                {"type": "text", "text": question}
            ]
        }]
    )
    return response.content[0].text
```

### 7.2 Transcription with Whisper

OpenAI's Whisper transcribes audio to text — runs locally for free:

```python
# multimodal/02_whisper.py
# pip install openai-whisper
import whisper

model = whisper.load_model("base")   # tiny/base/small/medium/large

def transcribe(audio_path: str) -> str:
    result = model.transcribe(audio_path)
    return result["text"]

# Translate audio to English regardless of source language
def transcribe_translate(audio_path: str) -> str:
    result = model.transcribe(audio_path, task="translate")
    return result["text"]

# With timestamps
def transcribe_with_timestamps(audio_path: str) -> list[dict]:
    result = model.transcribe(audio_path)
    return [{"start": s["start"], "end": s["end"], "text": s["text"]}
            for s in result["segments"]]

# Usage
text = transcribe("recording.mp3")
print(text)
```

### 7.3 Voice + LLM Pipeline

```python
# multimodal/03_voice_pipeline.py
"""
Record audio → Whisper transcription → Claude response → TTS playback
"""
import whisper
import anthropic
import subprocess
import tempfile
from pathlib import Path

# pip install openai-whisper sounddevice scipy pyttsx3

whisper_model = whisper.load_model("base")
claude_client = anthropic.Anthropic()

def record_audio(seconds: int = 5) -> str:
    """Record from microphone. Returns path to WAV file."""
    import sounddevice as sd
    import scipy.io.wavfile as wav
    import numpy as np

    print(f"Recording for {seconds} seconds...")
    sample_rate = 16000
    audio = sd.rec(int(seconds * sample_rate), samplerate=sample_rate,
                   channels=1, dtype="float32")
    sd.wait()
    path = tempfile.mktemp(suffix=".wav")
    wav.write(path, sample_rate, (audio * 32767).astype("int16"))
    return path

def speak(text: str):
    """Convert text to speech via pyttsx3."""
    import pyttsx3
    engine = pyttsx3.init()
    engine.say(text)
    engine.runAndWait()

def voice_loop():
    print("Voice assistant ready. Speak after the prompt.")
    conversation = []

    while True:
        path = record_audio(seconds=5)
        question = whisper_model.transcribe(path)["text"].strip()
        Path(path).unlink()

        if not question or question.lower() in ("quit", "exit", "stop"):
            print("Goodbye!")
            break

        print(f"You: {question}")
        conversation.append({"role": "user", "content": question})

        response = claude_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system="You are a concise voice assistant. Keep responses under 3 sentences.",
            messages=conversation
        )
        answer = response.content[0].text
        conversation.append({"role": "assistant", "content": answer})

        print(f"Claude: {answer}")
        speak(answer)

if __name__ == "__main__":
    voice_loop()
```

---

## Section 8 — Putting It All Together

### ▶ Final Project: Production RAG Service

```
Build a production-ready document Q&A service combining all workshop concepts:

Architecture:
  serve/app.py — FastAPI service with:
  POST /index   → accept markdown files, chunk + embed + store in Chroma
  POST /ask     → RAG query with response
  GET  /metrics → return token_count, cache_hits, avg_latency_ms, total_requests

Requirements:
1. PROMPT ENGINEERING
   - System prompt stored in prompts/versions/qa_v1.0.json (versioned)
   - Uses few-shot examples in the system prompt for format consistency

2. STRUCTURED OUTPUT
   - /ask returns JSON: {"answer": "...", "sources": [...], "confidence": 0.0-1.0}
   - Use tool_use pattern to guarantee JSON shape

3. EVALS
   - evals/golden_set.json: 10 question/answer pairs for your docs
   - GET /eval runs the golden set and returns pass_rate
   - Fail the eval if pass_rate < 0.8

4. COST OPTIMIZATION
   - Cache the system prompt (cache_control: ephemeral)
   - Route simple factual questions to claude-haiku-4-5-20251001
   - Route complex/multi-hop questions to claude-sonnet-4-6
   - Log: model_used, input_tokens, cache_read_tokens per request

5. MONITORING
   - Log each request to serve/requests.jsonl
   - GET /metrics reads the log and aggregates stats

pip install fastapi uvicorn
Run: uvicorn serve.app:app --reload
Test: curl -X POST localhost:8000/ask -d '{"question": "What is Workshop 1 about?"}'
```

---

## Quick Reference

### Prompt engineering checklist

```
□ System prompt: specific persona + constraints (not generic)
□ Few-shot examples: 2-3 input/output pairs for format
□ CoT instruction: "think step by step" for reasoning tasks
□ Output format: exact JSON schema or example
□ Negative constraints rewritten as positive instructions
□ Prompt versioned in JSON file with name + version
```

### Eval metrics to track

```
accuracy     = correct / total                  (classification)
recall@k     = relevant_in_top_k / relevant     (retrieval)
pass_rate    = passed / total                   (regression suite)
latency_p50  = median(latency_ms)              (performance)
cost_per_req = total_tokens * price / 1M        (economics)
```

### LoRA key hyperparameters

```python
LoraConfig(
    r=16,           # rank: 8-64 typical; higher = more capacity
    lora_alpha=32,  # usually 2x rank
    lora_dropout=0.1,
    target_modules=["q_proj", "v_proj"],  # attention layers
)
TrainingArguments(
    num_train_epochs=3,
    learning_rate=2e-4,   # typical LoRA LR
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,  # effective batch = 16
)
```

### vLLM startup

```bash
python -m vllm.entrypoints.openai.api_server \
  --model <model-name> \
  --port 8000 \
  --max-model-len 4096 \
  --tensor-parallel-size 1    # number of GPUs
```

### Cost optimization priority order

1. Use the cheapest model that meets quality bar (run evals to find it)
2. Cache long system prompts (`cache_control: ephemeral`)
3. Use batch API for offline workloads (50% discount)
4. Count tokens before sending; reject oversized inputs early
5. Run classification/extraction locally with a fine-tuned small model
