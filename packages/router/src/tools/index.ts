import {
  CheckContextSchema,
  CheckTreeSchema,
  CreateFileSchema,
  EditFileSchema,
  EscalateSchema,
  FindFilesSchema,
  GitDiffSummarySchema,
  GrepCodeSchema,
  OutlineFileSchema,
  RollbackEditSchema,
  RunCheckSchema,
  RunTestsSchema,
  ToolDefinition,
  ToolName,
} from "../types/tools.js";
import { executeCheckTree, executeFindFiles, executeGrepCode } from "./discovery.js";
import { executeCheckContext, executeOutlineFile } from "./context.js";
import { executeCreateFile, executeEditFile, executeRollbackEdit } from "./modification.js";
import { executeGitDiffSummary, executeRunCheck, executeRunTests } from "./verification.js";
import { executeEscalateToGemini } from "../models/gemini.js";

export const TOOLS: Record<ToolName, ToolDefinition<any>> = {
  check_tree: {
    name: "check_tree",
    description: "Inspect directory hierarchy with maxDepth limit (default: 2) to save tokens.",
    category: "discovery",
    schema: CheckTreeSchema,
    execute: executeCheckTree,
  },
  grep_code: {
    name: "grep_code",
    description: "Search codebase files for regex patterns, function names, or variables.",
    category: "discovery",
    schema: GrepCodeSchema,
    execute: executeGrepCode,
  },
  find_files: {
    name: "find_files",
    description: "Match files using glob patterns (e.g. *.config.ts, **/auth/**).",
    category: "discovery",
    schema: FindFilesSchema,
    execute: executeFindFiles,
  },
  outline_file: {
    name: "outline_file",
    description: "Extract declarations (classes, functions, interfaces, types) without reading bodies.",
    category: "context",
    schema: OutlineFileSchema,
    execute: executeOutlineFile,
  },
  check_context: {
    name: "check_context",
    description: "Read targeted line ranges or file slices (startLine, endLine).",
    category: "context",
    schema: CheckContextSchema,
    execute: executeCheckContext,
  },
  edit_file: {
    name: "edit_file",
    description: "Apply surgical text or block replacement in existing files.",
    category: "modification",
    schema: EditFileSchema,
    execute: executeEditFile,
  },
  create_file: {
    name: "create_file",
    description: "Generate a new file with specified initial content.",
    category: "modification",
    schema: CreateFileSchema,
    execute: executeCreateFile,
  },
  run_check: {
    name: "run_check",
    description: "Run local linter or TypeScript typechecker (e.g. npm run typecheck).",
    category: "verification",
    schema: RunCheckSchema,
    execute: executeRunCheck,
  },
  run_tests: {
    name: "run_tests",
    description: "Execute targeted unit tests related to edited files.",
    category: "verification",
    schema: RunTestsSchema,
    execute: executeRunTests,
  },
  git_diff_summary: {
    name: "git_diff_summary",
    description: "Inspect staged or unstaged modifications (git diff --stat).",
    category: "verification",
    schema: GitDiffSummarySchema,
    execute: executeGitDiffSummary,
  },
  rollback_edit: {
    name: "rollback_edit",
    description: "Revert the last surgical file modification to a clean checkpoint.",
    category: "verification",
    schema: RollbackEditSchema,
    execute: executeRollbackEdit,
  },
  escalate: {
    name: "escalate",
    description: "Dispatch task to frontier LLM (Google Gemini) for deep multi-file reasoning.",
    category: "escalation",
    schema: EscalateSchema,
    execute: executeEscalateToGemini,
  },
};

export function getAvailableToolsList(): Array<{ name: string; description: string; category: string }> {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
  }));
}
