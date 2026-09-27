# jev-router-ai

> **An ultra-lightweight, token-saving workspace action router and decision layer for LLM agents.**

`jev-router-ai` is an autonomous decision router engineered to drastically slash LLM token consumption and latency during codebase operations. Instead of piping massive file trees, grep outputs, and routine workspace edits into expensive, slow frontier models, `jev-router-ai` deploys an ultra-fast local decision model (Ollama `smollm2:135m` in development, TypeSafe AI's **Jev** in production) to analyze user intent and choose the exact local action to take.

The router decides when to **grep code**, **inspect file context**, **edit files**, **create files**, or **escalate to a frontier model**, autonomously redirecting its own actions if a search or edit fails—all while streaming its internal thought process live to an interactive CLI and a real-time React dashboard.

---

## 🚀 Key Highlights

* **Local Workspace Decision Engine:** A tiny local model (`smollm2:135m` or Jev) decides whether to `grep`, inspect context, edit, or create files—eliminating thousands of frontier tokens wasted on basic workspace discovery.
* **Massive Token & Cost Savings:** Routine exploration and surgical file modifications run entirely locally at **0 API token cost**, reserving heavy frontier LLMs exclusively for complex multi-file reasoning.
* **Autonomous Action Self-Redirection:** If a `grep` yields no matches, or an `edit_file` target string fails to match, the router catches the result, self-redirects, and selects a corrective follow-up action (e.g., broader search, context re-inspection, or model escalation) without stalling or bothering the user.
* **Real-Time Reasoning Stream:** Streams the router's internal rationale, chosen actions, tool parameters, and redirection loops live to both terminal logs and a real-time web UI over WebSockets.
* **Dual Interface (CLI + Live React Dashboard):** Execute prompts interactively in the terminal while observing real-time decision trees, cumulative tokens saved, and routing latencies on `localhost:3000`.
* **Resilient Parsing for Micro-LLMs:** Employs a hybrid JSON schema parser with regex fallback so even ultra-compact 135M models reliably output structured tool calls.
* **Strict npm Workspaces Monorepo:** Clean architectural separation across `packages/router`, `packages/cli`, and `packages/dashboard`.

---

## 🏗️ Architecture Overview

```mermaid
flowchart TD
    User([User Prompt]) --> CLI[Interactive CLI REPL]
    CLI --> Router["Router Engine (smollm2:135m / Jev)"]

    Router --> RouteLocal["Local Workspace Tools (0 API Tokens)\nDiscovery • Context • Edit • Verify"]
    Router --> RouteFrontier["Frontier LLM Escalation\nDeep multi-file reasoning"]

    RouteLocal -.->|Error / Low Confidence| Redirect[Adaptive Self-Redirection]
    Redirect -.->|Re-evaluate with feedback| Router

    RouteLocal --> Result([Task Complete / Output])
    RouteFrontier --> Result

    Router -.->|Telemetry Stream| WS[WebSocket Telemetry Server]
    WS -.-> Dashboard[Real-Time React Dashboard]
    Result --> CLI
```

---

## 🛠️ Local Action Toolset

The local router controls a comprehensive suite of deterministic workspace tools, grouped by operational phase:

### 1. Discovery & Search (0 API Tokens)
| Action Tool | Description | Why It Saves Tokens |
| :--- | :--- | :--- |
| `grep_code` | Searches codebase files for regex patterns, functions, or variable names. | Avoids passing entire project directories or file lists to a frontier model. |
| `check_tree` | Recursively inspects directory hierarchies with configurable depth limits (`maxDepth`). | Allows the small model to locate specific files in nested folders without dumping full repos into prompt context. |
| `find_files` | Matches files using fast glob patterns (e.g., `*.config.ts`, `**/auth/**`). | Finds configuration or target files instantly in milliseconds. |

### 2. Context Inspection (0 API Tokens)
| Action Tool | Description | Why It Saves Tokens |
| :--- | :--- | :--- |
| `outline_file` | Extracts top-level declarations (classes, functions, interfaces, types) from a file without reading bodies. | Condenses a 1,000-line file into a 25-line outline, saving ~95% of prompt tokens before reading lines. |
| `check_context` | Reads targeted line ranges or specific file slices. | Only reads the exact lines needed, preventing context-window bloat. |

### 3. Modification & Authoring (0 API Tokens)
| Action Tool | Description | Why It Saves Tokens |
| :--- | :--- | :--- |
| `edit_file` | Applies surgical text or block replacements in existing files. | Performs mechanical code updates locally without full-file regeneration costs. |
| `create_file` | Generates a new file with specified initial content. | Creates boilerplate, configurations, or new modules directly. |

### 4. Verification & Safety (0 API Tokens)
| Action Tool | Description | Why It Saves Tokens |
| :--- | :--- | :--- |
| `run_check` | Runs local linter or TypeScript typechecker (`tsc --noEmit`, `eslint`). | Catches syntax and type errors locally without asking a frontier LLM to review. |
| `run_tests` | Executes targeted unit tests related to edited files. | Verifies business logic correctness with immediate assertion feedback. |
| `git_diff_summary` | Inspects staged or unstaged modifications (`git diff --stat`). | Verifies changes before final completion. |
| `rollback_edit` | Reverts the last surgical file modification to a clean checkpoint. | Automatically undoes corrupted or repeated edit attempts before escalating. |

### 5. Escalation
| Action Tool | Description | Why It Saves Tokens |
| :--- | :--- | :--- |
| `escalate` | Dispatches task to frontier LLM (e.g. Claude / GPT). | Reserved exclusively for multi-file architectural refactors or complex algorithmic generation. |

---

### How Self-Redirection Works in Practice

```mermaid
flowchart TD
    Action[Action Dispatched] --> Exec[Execute Tool Locally]
    Exec --> ResultCheck{Action Succeeded?}
    
    ResultCheck -- "Success" --> Next[Next Step / Complete]
    ResultCheck -- "0 Matches / Syntax Error / Target Mismatch" --> Intercept[Intercept Output & Build Feedback]
    
    Intercept --> ReRoute["Self-Redirect: Re-evaluate Next Best Action"]
    ReRoute --> Action
```

1. **User Prompt:** *"Find where the user authentication token is verified and add expiration checking."*
2. **Step 1 (Tree Check / Search):** Small LLM decides: `check_tree { path: "src", maxDepth: 2 }` or `find_files { glob: "**/auth*" }`.
3. **Execution & Feedback:** Identifies `src/services/auth.service.ts`.
4. **Step 2 (Outline File):** Small LLM decides: `outline_file { path: "src/services/auth.service.ts" }`.
   * *Output:* Finds `verifyToken(token: string)` starts at line 48.
5. **Step 3 (Context Inspection):** Router reads lines 45–70 with `check_context`.
6. **Step 4 (Edit):** Router dispatches `edit_file` to add the expiration check.
7. **Step 5 (Verification):** Router runs `run_check { path: "src/services/auth.service.ts" }`.
   * If a syntax typo occurred, the router **redirects itself** using the compiler error to fix line 52.
   * If clean, verification succeeds!
8. **Total Tokens Burned on Frontier LLM:** **0 tokens** (entire lifecycle handled locally).

---

## 📊 Real-Time React Dashboard

The embedded HTTP server and WebSocket broadcaster stream live analytics to a React dashboard:

```mermaid
flowchart LR
    Router[Router Engine] -->|Real-time Events| WS[WebSocket Telemetry Hub]
    WS --> View1[Live Decision Timeline]
    WS --> View2[Tokens Saved Counter]
    WS --> View3[Tool Distribution Charts]
    WS --> View4[Decision Latency Telemetry]
```

* **Live Decision Pipeline:** Step-by-step interactive timeline showing prompt ingress, local LLM rationale, tool dispatch (`check_tree`, `outline_file`, `edit_file`, `run_check`), tool output, and redirection cycles.
* **Token Savings Scoreboard:** Real-time calculator comparing local execution (0 API tokens) against what a frontier model would have consumed for the same prompt context and tool loops.
* **Action Distribution Chart:** Pie/bar visualizer tracking frequencies across discovery, context, editing, verification, and escalation.
* **Latency Telemetry:** Execution speed broken down by router decision time vs. tool execution time.

---

## 🌲 `tree` Tool: Intelligent File Discovery & Navigation

Instead of dumping an entire repository's file tree (which consumes 10,000+ tokens on frontier models), `jev-router-ai` equips the local decision model with an intelligent `tree` tool (`check_tree`) with configurable depth constraints (`maxDepth`).

The router uses `tree` to inspect directory hierarchies progressively, narrow down ambiguous paths, and pinpoint the exact files needed for the task.

```mermaid
flowchart TD
    Prompt[User Prompt: 'Find where auth middleware is and how it validates tokens'] --> Router[Router: smollm2:135m / Jev]
    
    subgraph Tree Discovery & Search Pipeline [0 API Tokens]
        Router -->|Step 1: Inspect Root Hierarchy| CallTree["tree(path: '.', maxDepth: 2)"]
        CallTree --> FS[(Local Workspace Filesystem)]
        FS -->|Directory Tree Output| TreeOutput[Bounded Directory Tree]
        
        TreeOutput --> Evaluate{Evaluate Target File}
        
        Evaluate -- "Candidate found in subfolder" --> TargetFound["Target: src/middleware/auth.ts"]
        TargetFound --> ActionInspect["check_context(path: 'src/middleware/auth.ts', lines: 1-50)"]
        
        Evaluate -- "Deeply nested or ambiguous" --> RedirectTree["Self-Redirect: tree(path: 'src/services', maxDepth: 1)"]
        RedirectTree --> FS
    end

    ActionInspect --> Done[Task Resolved / Next Action Selected]
```

### Why the `tree` Tool Saves Massive Tokens:
* **Bounded Depth (`maxDepth`):** A small model inspects 1–2 levels deep at a time (~80 tokens) instead of swallowing the full recursive tree (~15,000 tokens).
* **Targeted Directory Zooming:** If the root tree reveals `src/` and `lib/`, the router self-redirects into `tree(path: 'src', maxDepth: 2)` to zero in on the exact file.
* **Seamless Chain into Context:** Once `tree` locates `auth.ts`, the router immediately transitions to `outline_file` or `check_context` without involving a frontier LLM.

---

## 🛠️ Prerequisites & Setup

### 1. Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* **Ollama**: Installed and running locally ([ollama.ai](https://ollama.ai))

### 2. Pull the Local Routing Model
In development, `jev-router-ai` uses the ultra-compact `smollm2:135m` model:

```bash
ollama run smollm2:135m
```

### 3. Install Dependencies
From the repository root:

```bash
npm install
```

### 4. Build All Workspaces
```bash
npm run build
```

---

## 💻 Usage

### Start Interactive CLI + Web Dashboard
Run the combined development environment:

```bash
npm run dev
```

This starts:
1. **Interactive CLI REPL** in your terminal:
   ```text
   [jev-router-ai] Router initialized with Ollama (smollm2:135m).
   [jev-router-ai] Telemetry server running at http://localhost:3000
   
   > Enter prompt: 
   ```
2. **Real-time Web Dashboard** at `http://localhost:3000`.

### Example CLI Session
```text
> Enter prompt: Find where jwt is validated and check if secret is hardcoded

[Router Thinking] User wants to inspect JWT validation. Initiating code search to locate relevant lines.
[Action Dispatched] grep_code: { "pattern": "jwt.verify" }
[Tool Output] Found 1 match in src/auth/jwt.ts:24

[Self-Redirection] Need surrounding context around line 24 to check secret usage.
[Action Dispatched] check_context: { "path": "src/auth/jwt.ts", "startLine": 15, "endLine": 35 }
[Tool Output] Read 20 lines. Secret is passed via process.env.JWT_SECRET.

[Router Result] The JWT verification is in src/auth/jwt.ts at line 24. The secret is securely read from process.env.JWT_SECRET and is not hardcoded.
[Telemetry] Decision Hops: 2 | Latency: 84ms | Frontier Tokens Burned: 0 | Saved: ~1,450 tokens
```

---

## 🗺️ Roadmap & Milestones

- [x] **Milestone 1: Architectural Definition & Requirements**
  - Define local workspace action toolset (`grep_code`, `check_context`, `edit_file`, `create_file`).
  - Specify adaptive self-redirection feedback loop.
  - Setup npm workspaces monorepo structure.
- [ ] **Milestone 2: Core Router Engine & Tools (`packages/router`)**
  - Implement Ollama client with `smollm2:135m`.
  - Build local workspace tool implementations (`grep`, `context`, `edit`, `create`).
  - Build hybrid JSON schema parser with regex fallback.
  - Implement self-redirection state machine to handle empty results / tool errors.
- [ ] **Milestone 3: Interactive CLI & Telemetry Server (`packages/cli`)**
  - Interactive terminal REPL with live streaming of router reasoning and tool actions.
  - Integrated HTTP & WebSocket server broadcasting telemetry events.
- [ ] **Milestone 4: Real-Time React Dashboard (`packages/dashboard`)**
  - Vite + React telemetry dashboard with live WebSocket listener.
  - Real-time decision pipeline timeline, tokens saved counter, and tool distribution charts.
- [ ] **Milestone 5: Production Target — Jev Integration**
  - Swap local Ollama with TypeSafe AI's **Jev** System One decision model.
  - Benchmark sub-100ms deterministic classification and production-scale workspace routing.

---

## 📄 License

MIT
