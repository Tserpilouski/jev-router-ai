import fs from "node:fs/promises";
import path from "node:path";
import { CheckContextParams, OutlineFileParams, ToolResult } from "../types/tools.js";

/**
 * outline_file: Extracts top-level declarations (classes, functions, interfaces, types)
 * without reading implementation bodies, saving up to ~95% of prompt tokens.
 */
export async function executeOutlineFile(params: OutlineFileParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const filePath = path.resolve(workspaceRoot, params.path);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const outlineItems: Array<{ line: number; text: string }> = [];

    // Regex to capture function, class, interface, type, export, enum signatures
    const signatureRegex =
      /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([a-zA-Z0-9_$]+)/;
    const methodRegex = /^\s+(?:public|private|protected|static|async)?\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*[:{]/;

    lines.forEach((rawLine, index) => {
      const lineNum = index + 1;
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return;
      }

      if (signatureRegex.test(rawLine)) {
        outlineItems.push({ line: lineNum, text: rawLine.trimEnd() });
      } else if (methodRegex.test(rawLine)) {
        outlineItems.push({ line: lineNum, text: `  ${rawLine.trim()}` });
      }
    });

    if (outlineItems.length === 0) {
      // Fallback: show first 10 non-empty lines
      const preview = lines
        .slice(0, 15)
        .map((l, i) => `${i + 1}: ${l}`)
        .join("\n");
      return {
        success: true,
        output: `File outline (header preview):\n${preview}`,
        tokensSavedEstimate: Math.max(500, lines.length * 4),
        executionTimeMs: Date.now() - startTime,
      };
    }

    const output = outlineItems.map((item) => `L${item.line.toString().padEnd(4)} | ${item.text}`).join("\n");

    // Token savings: instead of 1,000 lines (e.g. ~4,000 tokens), outline produces ~150 tokens.
    const tokensSaved = Math.max(800, lines.length * 4 - outlineItems.length * 10);

    return {
      success: true,
      output: `Outline for ${params.path} (${outlineItems.length} symbols found across ${lines.length} lines):\n\n${output}`,
      tokensSavedEstimate: tokensSaved,
      executionTimeMs: Date.now() - startTime,
      metadata: { totalLines: lines.length, symbolCount: outlineItems.length },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `outline_file failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * check_context: Reads targeted line ranges or file slices
 */
export async function executeCheckContext(params: CheckContextParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const filePath = path.resolve(workspaceRoot, params.path);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const start = Math.max(1, params.startLine ?? 1);
    const end = Math.min(lines.length, params.endLine ?? Math.min(start + 60, lines.length));

    if (start > lines.length) {
      return {
        success: false,
        output: "",
        error: `Requested startLine ${start} exceeds total lines (${lines.length}) in ${params.path}`,
        tokensSavedEstimate: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const slice = lines.slice(start - 1, end);
    const formatted = slice
      .map((line, idx) => {
        const lineNum = start + idx;
        return `${lineNum.toString().padStart(4, " ")} | ${line}`;
      })
      .join("\n");

    // Saving estimate: Reading 30 lines instead of entire file (e.g. 1000 lines) saves (1000 - 30) * 4 tokens
    const unreadLines = lines.length - slice.length;
    const tokensSaved = Math.max(200, unreadLines * 4);

    return {
      success: true,
      output: `File: ${params.path} (Lines ${start}-${end} of ${lines.length}):\n\n${formatted}`,
      tokensSavedEstimate: tokensSaved,
      executionTimeMs: Date.now() - startTime,
      metadata: { start, end, totalLines: lines.length },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `check_context failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
