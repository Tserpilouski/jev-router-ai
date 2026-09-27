import { exec } from "node:child_process";
import { promisify } from "node:util";
import { GitDiffSummaryParams, RunCheckParams, RunTestsParams, ToolResult } from "../types/tools.js";

const execAsync = promisify(exec);

/**
 * run_check: Runs local linter or TypeScript typecheck
 */
export async function executeRunCheck(params: RunCheckParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const cmd = params.command || "npm run typecheck";

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: workspaceRoot,
      timeout: 30000,
    });

    const output = [stdout, stderr].filter(Boolean).join("\n").trim();

    return {
      success: true,
      output: output || "All checks passed cleanly with 0 errors.",
      tokensSavedEstimate: 1200,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorWithOutput = err as { stdout?: string; stderr?: string; message?: string };
    const errOutput = [errorWithOutput.stdout, errorWithOutput.stderr, errorWithOutput.message]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      success: false,
      output: errOutput,
      error: "CHECK_FAILED",
      tokensSavedEstimate: 800,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * run_tests: Executes targeted unit tests
 */
export async function executeRunTests(params: RunTestsParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const testFilter = params.filter ? ` -- ${params.filter}` : "";
  const cmd = `npm test${testFilter}`;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: workspaceRoot,
      timeout: 60000,
    });

    return {
      success: true,
      output: [stdout, stderr].filter(Boolean).join("\n").trim() || "Tests completed successfully.",
      tokensSavedEstimate: 1500,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorWithOutput = err as { stdout?: string; stderr?: string; message?: string };
    const errOutput = [errorWithOutput.stdout, errorWithOutput.stderr, errorWithOutput.message]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      success: false,
      output: errOutput,
      error: "TESTS_FAILED",
      tokensSavedEstimate: 1000,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * git_diff_summary: Inspects modified files and line deltas
 */
export async function executeGitDiffSummary(params: GitDiffSummaryParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const cmd = params.staged ? "git diff --staged --stat" : "git diff --stat";

  try {
    const { stdout } = await execAsync(cmd, { cwd: workspaceRoot });
    const output = stdout.trim();

    return {
      success: true,
      output: output || "No git modifications detected in working directory.",
      tokensSavedEstimate: 600,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `git diff failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
