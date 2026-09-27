import fs from "node:fs/promises";
import path from "node:path";
import { CreateFileParams, EditFileParams, RollbackEditParams, ToolResult } from "../types/tools.js";

// In-memory checkpoint registry for rollback capability
const rollbackHistory = new Map<string, string[]>();

export function pushCheckpoint(filePath: string, content: string) {
  const history = rollbackHistory.get(filePath) || [];
  history.push(content);
  rollbackHistory.set(filePath, history);
}

export function popCheckpoint(filePath: string): string | undefined {
  const history = rollbackHistory.get(filePath);
  if (!history || history.length === 0) return undefined;
  return history.pop();
}

/**
 * edit_file: Performs surgical block or string replacement locally
 */
export async function executeEditFile(params: EditFileParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const filePath = path.resolve(workspaceRoot, params.path);

  try {
    const originalContent = await fs.readFile(filePath, "utf-8");

    if (!originalContent.includes(params.targetContent)) {
      return {
        success: false,
        output: "",
        error: `Target content not found in ${params.path}. Cannot perform surgical replacement.`,
        tokensSavedEstimate: 0,
        executionTimeMs: Date.now() - startTime,
        metadata: { path: params.path, targetContentLength: params.targetContent.length },
      };
    }

    // Save checkpoint for rollback
    pushCheckpoint(filePath, originalContent);

    // Apply replacement
    const newContent = originalContent.replace(params.targetContent, params.replacementContent);
    await fs.writeFile(filePath, newContent, "utf-8");

    // Saving estimate: frontier model would rewrite entire file (e.g. 500 lines = ~2,000 tokens)
    const originalLines = originalContent.split("\n").length;
    const tokensSaved = Math.max(1000, originalLines * 4);

    return {
      success: true,
      output: `Successfully updated ${params.path} (Replaced ${params.targetContent.length} chars with ${params.replacementContent.length} chars). Checkpoint saved.`,
      tokensSavedEstimate: tokensSaved,
      executionTimeMs: Date.now() - startTime,
      metadata: { path: params.path, originalLines },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `edit_file failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * create_file: Creates a new file with specified content
 */
export async function executeCreateFile(params: CreateFileParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const filePath = path.resolve(workspaceRoot, params.path);

  try {
    const parentDir = path.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });

    let exists = false;
    try {
      await fs.stat(filePath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists && !params.overwrite) {
      return {
        success: false,
        output: "",
        error: `File ${params.path} already exists. Set overwrite: true if you want to replace it.`,
        tokensSavedEstimate: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (exists) {
      const oldContent = await fs.readFile(filePath, "utf-8");
      pushCheckpoint(filePath, oldContent);
    }

    await fs.writeFile(filePath, params.content, "utf-8");

    const lines = params.content.split("\n").length;
    const tokensSaved = Math.max(800, lines * 4);

    return {
      success: true,
      output: `File created at ${params.path} (${lines} lines, ${params.content.length} bytes).`,
      tokensSavedEstimate: tokensSaved,
      executionTimeMs: Date.now() - startTime,
      metadata: { path: params.path, lines, bytes: params.content.length },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `create_file failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * rollback_edit: Reverts last modification using saved checkpoint
 */
export async function executeRollbackEdit(params: RollbackEditParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const filePath = path.resolve(workspaceRoot, params.path || "");

  try {
    let target = filePath;
    if (!params.path) {
      // Find most recent checkpoint
      const keys = Array.from(rollbackHistory.keys());
      if (keys.length === 0) {
        return {
          success: false,
          output: "",
          error: "No edit checkpoints available to roll back.",
          tokensSavedEstimate: 0,
          executionTimeMs: Date.now() - startTime,
        };
      }
      target = keys[keys.length - 1];
    }

    const previousContent = popCheckpoint(target);
    if (!previousContent) {
      return {
        success: false,
        output: "",
        error: `No checkpoints available for ${path.relative(workspaceRoot, target)}.`,
        tokensSavedEstimate: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }

    await fs.writeFile(target, previousContent, "utf-8");

    return {
      success: true,
      output: `Successfully rolled back ${path.relative(workspaceRoot, target)} to previous checkpoint.`,
      tokensSavedEstimate: 1000,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `rollback_edit failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
