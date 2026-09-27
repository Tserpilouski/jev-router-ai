import { z } from "zod";

export const GrepCodeSchema = z.object({
  pattern: z.string().describe("Regex or string pattern to search for in codebase files"),
  path: z.string().optional().default(".").describe("Directory or file path to search in"),
  filePattern: z.string().optional().describe("Optional glob pattern to filter target files, e.g. '*.ts'"),
  maxResults: z.number().optional().default(20).describe("Maximum number of matching lines to return"),
});
export type GrepCodeParams = z.infer<typeof GrepCodeSchema>;

export const CheckTreeSchema = z.object({
  path: z.string().optional().default(".").describe("Directory root to inspect"),
  maxDepth: z.number().optional().default(2).describe("Maximum hierarchy traversal depth to save tokens"),
  includeHidden: z.boolean().optional().default(false).describe("Whether to include hidden dotfiles"),
});
export type CheckTreeParams = z.infer<typeof CheckTreeSchema>;

export const FindFilesSchema = z.object({
  glob: z.string().describe("Glob pattern to match file paths, e.g. '**/*.auth.ts'"),
  cwd: z.string().optional().default(".").describe("Base directory for glob matching"),
});
export type FindFilesParams = z.infer<typeof FindFilesSchema>;

export const OutlineFileSchema = z.object({
  path: z.string().describe("Path to code file to outline (classes, functions, interfaces, methods)"),
});
export type OutlineFileParams = z.infer<typeof OutlineFileSchema>;

export const CheckContextSchema = z.object({
  path: z.string().describe("Path of file to inspect"),
  startLine: z.number().optional().describe("1-indexed starting line number"),
  endLine: z.number().optional().describe("1-indexed ending line number"),
});
export type CheckContextParams = z.infer<typeof CheckContextSchema>;

export const EditFileSchema = z.object({
  path: z.string().describe("Path of the file to modify"),
  targetContent: z.string().describe("Exact snippet or block of text to replace"),
  replacementContent: z.string().describe("New replacement code"),
});
export type EditFileParams = z.infer<typeof EditFileSchema>;

export const CreateFileSchema = z.object({
  path: z.string().describe("Destination file path to create"),
  content: z.string().describe("Initial file content"),
  overwrite: z.boolean().optional().default(false).describe("Whether to overwrite if file already exists"),
});
export type CreateFileParams = z.infer<typeof CreateFileSchema>;

export const RunCheckSchema = z.object({
  command: z.string().optional().default("npm run typecheck").describe("Linter or compiler check command"),
  path: z.string().optional().describe("Target file path to check"),
});
export type RunCheckParams = z.infer<typeof RunCheckSchema>;

export const RunTestsSchema = z.object({
  filter: z.string().optional().describe("Test name or filename pattern filter"),
});
export type RunTestsParams = z.infer<typeof RunTestsSchema>;

export const GitDiffSummarySchema = z.object({
  staged: z.boolean().optional().default(false).describe("Inspect staged vs working tree changes"),
});
export type GitDiffSummaryParams = z.infer<typeof GitDiffSummarySchema>;

export const RollbackEditSchema = z.object({
  path: z.string().optional().describe("Specific file to revert from checkpoint"),
});
export type RollbackEditParams = z.infer<typeof RollbackEditSchema>;

export const EscalateSchema = z.object({
  reason: z.string().describe("Explanation why task cannot be resolved locally"),
  fullPrompt: z.string().describe("Refined context and prompt for the frontier LLM"),
});
export type EscalateParams = z.infer<typeof EscalateSchema>;

export type ToolName =
  | "grep_code"
  | "check_tree"
  | "find_files"
  | "outline_file"
  | "check_context"
  | "edit_file"
  | "create_file"
  | "run_check"
  | "run_tests"
  | "git_diff_summary"
  | "rollback_edit"
  | "escalate";

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  tokensSavedEstimate: number;
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition<TParams = unknown> {
  name: ToolName;
  description: string;
  category: "discovery" | "context" | "modification" | "verification" | "escalation";
  schema: z.ZodType<TParams>;
  execute: (params: TParams, workspaceRoot: string) => Promise<ToolResult>;
}
