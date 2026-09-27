import { ToolName, ToolResult } from "./tools.js";

export type RouterPhase = "idle" | "thinking" | "executing" | "redirecting" | "escalated" | "completed" | "error";

export interface DecisionHop {
  hopIndex: number;
  reasoning: string;
  selectedTool: ToolName;
  toolParameters: Record<string, unknown>;
  toolResult?: ToolResult;
  selfRedirection?: {
    triggered: boolean;
    reason: string;
    suggestedAction?: string;
  };
  latencyMs: number;
  timestamp: number;
}

export interface RouterSessionState {
  sessionId: string;
  userPrompt: string;
  workspaceRoot: string;
  currentPhase: RouterPhase;
  hops: DecisionHop[];
  totalFrontierTokensBurned: number;
  totalTokensSavedEstimate: number;
  totalLatencyMs: number;
  finalResult?: string;
}

export type TelemetryEventType =
  | "router:init"
  | "router:prompt"
  | "router:thinking"
  | "router:action_dispatched"
  | "router:tool_output"
  | "router:self_redirect"
  | "router:completed"
  | "router:escalated"
  | "router:error";

export interface TelemetryEvent {
  type: TelemetryEventType;
  sessionId: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export type TelemetryListener = (event: TelemetryEvent) => void;
