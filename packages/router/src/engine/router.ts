import { randomUUID } from "node:crypto";
import { TOOLS } from "../tools/index.js";
import { OllamaDecisionEngine } from "../models/ollama.js";
import {
  DecisionHop,
  RouterSessionState,
  TelemetryEvent,
  TelemetryListener,
} from "../types/router.js";
import { ToolName, ToolResult } from "../types/tools.js";

export interface RouterOptions {
  workspaceRoot?: string;
  maxHops?: number;
  ollamaHost?: string;
  ollamaModel?: string;
  onTelemetry?: TelemetryListener;
}

export class RouterEngine {
  private workspaceRoot: string;
  private maxHops: number;
  private decisionEngine: OllamaDecisionEngine;
  private telemetryListeners: TelemetryListener[] = [];

  constructor(options: RouterOptions = {}) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.maxHops = options.maxHops ?? 6;
    this.decisionEngine = new OllamaDecisionEngine(options.ollamaHost, options.ollamaModel);

    if (options.onTelemetry) {
      this.subscribe(options.onTelemetry);
    }
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.telemetryListeners.push(listener);
    return () => {
      this.telemetryListeners = this.telemetryListeners.filter((l) => l !== listener);
    };
  }

  private emit(type: TelemetryEvent["type"], sessionId: string, payload: Record<string, unknown>) {
    const event: TelemetryEvent = {
      type,
      sessionId,
      timestamp: Date.now(),
      payload,
    };
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Telemetry listener error:", err);
      }
    });
  }

  public async runPrompt(userPrompt: string): Promise<RouterSessionState> {
    const sessionId = randomUUID();
    const sessionStartTime = Date.now();

    const state: RouterSessionState = {
      sessionId,
      userPrompt,
      workspaceRoot: this.workspaceRoot,
      currentPhase: "thinking",
      hops: [],
      totalFrontierTokensBurned: 0,
      totalTokensSavedEstimate: 0,
      totalLatencyMs: 0,
    };

    this.emit("router:prompt", sessionId, { prompt: userPrompt, workspace: this.workspaceRoot });

    const history: Array<{
      action: string;
      parameters: Record<string, unknown>;
      output: string;
      error?: string;
    }> = [];

    let currentFeedback: string | undefined;

    for (let hop = 1; hop <= this.maxHops; hop++) {
      const hopStartTime = Date.now();

      // 1. Thinking / Decision step
      this.emit("router:thinking", sessionId, {
        hopIndex: hop,
        feedback: currentFeedback,
      });

      const decision = await this.decisionEngine.decideNextAction({
        userPrompt,
        workspaceRoot: this.workspaceRoot,
        history,
        feedback: currentFeedback,
      });

      // If model marked task as complete
      if (decision.isComplete) {
        state.currentPhase = "completed";
        state.finalResult = decision.finalMessage || "Task completed successfully.";
        this.emit("router:completed", sessionId, {
          message: state.finalResult,
          totalHops: hop - 1,
          totalTokensSaved: state.totalTokensSavedEstimate,
        });
        break;
      }

      const toolName: ToolName = decision.action;
      const toolDef = TOOLS[toolName];

      if (!toolDef) {
        // Unknown tool fallback -> self-redirect
        currentFeedback = `Action '${decision.action}' is not a valid tool. Choose one of: ${Object.keys(TOOLS).join(", ")}`;
        this.emit("router:self_redirect", sessionId, {
          hopIndex: hop,
          reason: currentFeedback,
        });
        continue;
      }

      // 2. Dispatch action
      this.emit("router:action_dispatched", sessionId, {
        hopIndex: hop,
        action: toolName,
        parameters: decision.parameters,
        reasoning: decision.reasoning,
      });

      // 3. Execute tool locally (0 API tokens, or Gemini for escalate)
      let toolResult: ToolResult;
      try {
        toolResult = await toolDef.execute(decision.parameters, this.workspaceRoot);
      } catch (err: unknown) {
        const errStr = err instanceof Error ? err.message : String(err);
        toolResult = {
          success: false,
          output: "",
          error: `Execution exception: ${errStr}`,
          tokensSavedEstimate: 0,
          executionTimeMs: Date.now() - hopStartTime,
        };
      }

      state.totalTokensSavedEstimate += toolResult.tokensSavedEstimate;
      if (toolResult.metadata?.tokensBurned) {
        state.totalFrontierTokensBurned += Number(toolResult.metadata.tokensBurned);
      }

      // Record history
      history.push({
        action: toolName,
        parameters: decision.parameters,
        output: toolResult.output,
        error: toolResult.error,
      });

      this.emit("router:tool_output", sessionId, {
        hopIndex: hop,
        action: toolName,
        success: toolResult.success,
        output: toolResult.output.slice(0, 500),
        tokensSaved: toolResult.tokensSavedEstimate,
        executionTimeMs: toolResult.executionTimeMs,
      });

      // Check for escalation
      if (toolName === "escalate") {
        state.currentPhase = "escalated";
        state.finalResult = toolResult.output;
        this.emit("router:escalated", sessionId, {
          reason: decision.parameters.reason,
          result: toolResult.output,
        });
        break;
      }

      // 4. Adaptive Self-Redirection evaluation
      let selfRedirectInfo: DecisionHop["selfRedirection"] | undefined;

      if (!toolResult.success) {
        let suggestion = "Re-evaluate intent and try a broader search or different path.";
        if (toolResult.error === "0_MATCHES") {
          suggestion = "Grep found 0 matches. Self-redirect: use check_tree to discover project structure or find_files to locate filenames.";
        } else if (toolResult.error?.includes("Target content not found")) {
          suggestion = "Edit string target mismatch. Self-redirect: run check_context on the file to inspect the exact lines before replacing.";
        } else if (toolResult.error === "CHECK_FAILED") {
          suggestion = `Compiler/linter check failed with errors: ${toolResult.output.slice(0, 200)}. Self-redirect: inspect error lines and apply fix.`;
        }

        selfRedirectInfo = {
          triggered: true,
          reason: toolResult.error || "Tool failed",
          suggestedAction: suggestion,
        };

        currentFeedback = suggestion;
        state.currentPhase = "redirecting";

        this.emit("router:self_redirect", sessionId, {
          hopIndex: hop,
          reason: selfRedirectInfo.reason,
          suggestion,
        });
      } else {
        // Successful hop - clear feedback
        currentFeedback = undefined;
        state.currentPhase = "executing";

        // If the action was edit_file and succeeded, or check_context answered user query
        if (toolName === "create_file" || (toolName === "edit_file" && hop >= 2)) {
          // If editing was successful, optionally complete
          state.finalResult = `Changes applied successfully: ${toolResult.output}`;
        }
      }

      const hopRecord: DecisionHop = {
        hopIndex: hop,
        reasoning: decision.reasoning,
        selectedTool: toolName,
        toolParameters: decision.parameters,
        toolResult,
        selfRedirection: selfRedirectInfo,
        latencyMs: Date.now() - hopStartTime,
        timestamp: Date.now(),
      };

      state.hops.push(hopRecord);

      // Stop if max hops reached or single-hop informational task satisfied
      if (hop >= this.maxHops) {
        state.currentPhase = "completed";
        state.finalResult = state.finalResult || history[history.length - 1]?.output || "Workflow reached max hops.";
        break;
      }
    }

    state.totalLatencyMs = Date.now() - sessionStartTime;
    return state;
  }
}
