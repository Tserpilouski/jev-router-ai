import { ToolName } from "../types/tools.js";

export interface ParsedRouterDecision {
  action: ToolName;
  parameters: Record<string, unknown>;
  reasoning: string;
  isComplete: boolean;
  finalMessage?: string;
  rawOutput: string;
}

const VALID_TOOLS: Set<ToolName> = new Set([
  "check_tree",
  "grep_code",
  "find_files",
  "outline_file",
  "check_context",
  "edit_file",
  "create_file",
  "run_check",
  "run_tests",
  "git_diff_summary",
  "rollback_edit",
  "escalate",
]);

/**
 * Resilient JSON + Regex fallback parser designed for micro-LLMs (smollm2:135m)
 */
export function parseRouterDecision(rawText: string, userPrompt: string): ParsedRouterDecision {
  const cleaned = rawText.trim();

  // 1. Check if model signaled task completion
  if (
    cleaned.includes('"complete": true') ||
    cleaned.includes('"action": "complete"') ||
    cleaned.includes('"action":"complete"')
  ) {
    return {
      action: "check_context",
      parameters: {},
      reasoning: "Task completed.",
      isComplete: true,
      finalMessage: extractCompletionMessage(cleaned),
      rawOutput: cleaned,
    };
  }

  // 2. Try parsing complete JSON directly
  try {
    const parsed = JSON.parse(cleaned);
    if (isValidToolObject(parsed)) {
      return normalizeDecision(parsed, cleaned);
    }
  } catch {
    // Continue to extractors
  }

  // 3. Extract from markdown code fences (```json ... ``` or ``` ...)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (isValidToolObject(parsed)) {
        return normalizeDecision(parsed, cleaned);
      }
    } catch {
      // Continue to bracket search
    }
  }

  // 4. Extract largest curly-brace substring { ... }
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const candidate = jsonObjectMatch[0];
      const parsed = JSON.parse(candidate);
      if (isValidToolObject(parsed)) {
        return normalizeDecision(parsed, cleaned);
      }
    } catch {
      // Try relaxed parsing (fixing trailing commas, unquoted keys)
      const relaxed = tryRelaxedJsonParse(jsonObjectMatch[0]);
      if (relaxed && isValidToolObject(relaxed)) {
        return normalizeDecision(relaxed, cleaned);
      }
    }
  }

  // 5. Regex Fallback: extract action, parameters, reasoning individually
  const actionMatch = cleaned.match(/["']?action["']?\s*[:=]\s*["']?([a-zA-Z0-9_]+)["']?/i);
  if (actionMatch && VALID_TOOLS.has(actionMatch[1].toLowerCase() as ToolName)) {
    const detectedAction = actionMatch[1].toLowerCase() as ToolName;
    const reasoningMatch = cleaned.match(/["']?reasoning["']?\s*[:=]\s*["']([^"']+)["']/i);
    const reasoning = reasoningMatch ? reasoningMatch[1] : `Initiating ${detectedAction}`;

    // Extract basic parameters based on action
    const parameters = extractParametersByAction(detectedAction, cleaned, userPrompt);

    return {
      action: detectedAction,
      parameters,
      reasoning,
      isComplete: false,
      rawOutput: cleaned,
    };
  }

  // 6. Intelligent Fallback based on user prompt semantics
  const fallback = inferActionFromPrompt(userPrompt);
  return {
    action: fallback.action,
    parameters: fallback.parameters,
    reasoning: `Extracted intent from prompt: ${fallback.reasoning}`,
    isComplete: false,
    rawOutput: cleaned,
  };
}

function isValidToolObject(obj: unknown): obj is { action: string; parameters?: Record<string, unknown>; reasoning?: string } {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.action === "string" && (VALID_TOOLS.has(o.action as ToolName) || o.action === "complete");
}

function normalizeDecision(
  parsed: { action: string; parameters?: Record<string, unknown>; reasoning?: string; message?: string },
  raw: string
): ParsedRouterDecision {
  if (parsed.action === "complete") {
    return {
      action: "check_context",
      parameters: {},
      reasoning: parsed.reasoning || "Finished.",
      isComplete: true,
      finalMessage: parsed.message || parsed.reasoning || "Task complete.",
      rawOutput: raw,
    };
  }

  return {
    action: parsed.action as ToolName,
    parameters: parsed.parameters || {},
    reasoning: parsed.reasoning || `Executing ${parsed.action}`,
    isComplete: false,
    rawOutput: raw,
  };
}

function tryRelaxedJsonParse(str: string): Record<string, unknown> | null {
  try {
    // Remove trailing commas before } or ]
    const cleaned = str
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function extractParametersByAction(action: ToolName, text: string, userPrompt: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (action === "grep_code") {
    const patternMatch = text.match(/["']?pattern["']?\s*[:=]\s*["']([^"']+)["']/i);
    params.pattern = patternMatch ? patternMatch[1] : extractKeyTermFromPrompt(userPrompt);
  } else if (action === "check_tree") {
    const depthMatch = text.match(/["']?maxDepth["']?\s*[:=]\s*(\d+)/i);
    params.maxDepth = depthMatch ? parseInt(depthMatch[1], 10) : 2;
    params.path = ".";
  } else if (action === "find_files") {
    const globMatch = text.match(/["']?glob["']?\s*[:=]\s*["']([^"']+)["']/i);
    params.glob = globMatch ? globMatch[1] : "*";
  } else if (action === "check_context" || action === "outline_file") {
    const pathMatch = text.match(/["']?path["']?\s*[:=]\s*["']([^"']+)["']/i);
    if (pathMatch) params.path = pathMatch[1];
  }

  return params;
}

function inferActionFromPrompt(prompt: string): { action: ToolName; parameters: Record<string, unknown>; reasoning: string } {
  const p = prompt.toLowerCase();

  if (p.includes("tree") || p.includes("structure") || p.includes("folder") || p.includes("directory")) {
    return {
      action: "check_tree",
      parameters: { path: ".", maxDepth: 2 },
      reasoning: "Checking directory structure to locate files.",
    };
  }

  if (p.includes("find file") || p.includes("where is") || p.includes("look for file")) {
    return {
      action: "find_files",
      parameters: { glob: "**/*" },
      reasoning: "Searching workspace for target files.",
    };
  }

  if (p.includes("outline") || p.includes("methods") || p.includes("symbols")) {
    return {
      action: "outline_file",
      parameters: { path: "src/index.ts" },
      reasoning: "Extracting file outline.",
    };
  }

  // Default: grep code for key terms
  const term = extractKeyTermFromPrompt(prompt);
  return {
    action: "grep_code",
    parameters: { pattern: term },
    reasoning: `Searching codebase for "${term}".`,
  };
}

function extractKeyTermFromPrompt(prompt: string): string {
  // Extract words inside quotes if present
  const quoteMatch = prompt.match(/["']([^"']+)["']/);
  if (quoteMatch) return quoteMatch[1];

  const words = prompt
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["find", "where", "what", "code", "file", "check", "look"].includes(w.toLowerCase()));

  return words[0] || "router";
}

function extractCompletionMessage(text: string): string {
  const msgMatch = text.match(/["']?(?:message|summary|result)["']?\s*[:=]\s*["']([^"']+)["']/i);
  return msgMatch ? msgMatch[1] : "Task completed successfully.";
}
