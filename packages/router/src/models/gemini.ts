import { GoogleGenAI } from "@google/genai";
import { EscalateParams, ToolResult } from "../types/tools.js";

export async function executeEscalateToGemini(
  params: EscalateParams,
  workspaceRoot: string,
  extraContext?: string
): Promise<ToolResult> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return {
      success: false,
      output: `[ESCALATION DISPATCHED]\nTask requires frontier model.\nReason: ${params.reason}\n\n⚠️ Google Gemini API key not found. Please set GEMINI_API_KEY in your .env file or environment to enable live frontier LLM reasoning.\n\nPrepared Prompt for Frontier Model:\n${params.fullPrompt}`,
      error: "MISSING_GEMINI_API_KEY",
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
      metadata: { model: modelName, reason: params.reason },
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemContext = `You are a frontier code reasoning engine operating in workspace: ${workspaceRoot}.
The local workspace router has escalated this complex architectural task to you.
Reasoning for escalation: ${params.reason}

Additional workspace history:
${extraContext || "None"}

Please provide a precise, thorough solution or code diff:`;

    const fullPrompt = `${systemContext}\n\nTask:\n${params.fullPrompt}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
    });

    const responseText = response.text || "Frontier model returned empty response.";

    // Estimated frontier tokens burned: ~2,500 - 6,000
    const tokensBurned = Math.round(fullPrompt.length / 4 + responseText.length / 4);

    return {
      success: true,
      output: `[Frontier Escalation - ${modelName}]\n${responseText}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
      metadata: {
        model: modelName,
        tokensBurned,
        reason: params.reason,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `Gemini escalation error: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
