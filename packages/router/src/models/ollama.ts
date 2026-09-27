import { parseRouterDecision, ParsedRouterDecision } from "./parser.js";

export interface DecisionEngineRequest {
  userPrompt: string;
  workspaceRoot: string;
  history: Array<{
    action: string;
    parameters: Record<string, unknown>;
    output: string;
    error?: string;
  }>;
  feedback?: string;
}

export class OllamaDecisionEngine {
  private host: string;
  private model: string;

  constructor(host?: string, model?: string) {
    this.host = host || process.env.OLLAMA_HOST || "http://localhost:11434";
    this.model = model || process.env.OLLAMA_MODEL || "smollm2:135m";
  }

  async decideNextAction(req: DecisionEngineRequest): Promise<ParsedRouterDecision> {
    const systemPrompt = `You are jev-router-ai, an ultra-fast local workspace router.
Choose ONE action from:
- check_tree: {"path": "."}
- grep_code: {"pattern": "<term>"}
- find_files: {"glob": "**/*"}
- outline_file: {"path": "<file>"}
- check_context: {"path": "<file>", "startLine": 1, "endLine": 50}
- edit_file: {"path": "<file>", "targetContent": "<exact text>", "replacementContent": "<new text>"}
- create_file: {"path": "<file>", "content": "<text>"}
- run_check: {"command": "npm run typecheck"}
- escalate: {"reason": "<reason>", "fullPrompt": "<prompt>"}
- complete: {"message": "<summary of result>"}

RULES:
1. If the previous tool result already answered the user's request, choose action "complete".
2. Never repeat a failed action with the same parameters.
3. Output ONLY a valid JSON object matching: {"action": "...", "parameters": {...}, "reasoning": "..."}`;

    let conversationText = `User Prompt: ${req.userPrompt}\n`;

    if (req.history.length > 0) {
      conversationText += `\nPrevious Action History:\n`;
      req.history.forEach((h, i) => {
        conversationText += `Step ${i + 1}: ${h.action} (${JSON.stringify(h.parameters)})\n`;
        conversationText += `Result: ${h.output.slice(0, 300)}${h.output.length > 300 ? "..." : ""}\n`;
        if (h.error) conversationText += `Error: ${h.error}\n`;
      });
    }

    if (req.feedback) {
      conversationText += `\n[ADAPTIVE FEEDBACK]: ${req.feedback}\nPlease self-redirect and select the next corrective action.\n`;
    }

    conversationText += `\nNext Action JSON:`;

    try {
      const response = await fetch(`${this.host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\n${conversationText}`,
          stream: false,
          format: "json",
          options: {
            temperature: 0.1,
            num_predict: 256,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP error ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as { response: string };
      return parseRouterDecision(data.response, req.userPrompt);
    } catch (err: unknown) {
      // If Ollama connection fails, graceful fallback to prompt parser
      console.warn(`[Ollama Warning] Could not reach Ollama at ${this.host}. Using heuristic fallback parser.`);
      return parseRouterDecision("", req.userPrompt);
    }
  }
}
