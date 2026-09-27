import fs from "node:fs/promises";
import path from "node:path";
import { CheckTreeParams, FindFilesParams, GrepCodeParams, ToolResult } from "../types/tools.js";

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

/**
 * check_tree: Bounded recursive directory inspection
 */
export async function executeCheckTree(params: CheckTreeParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  let requestedPath = params.path || ".";
  if (requestedPath.includes("*") || requestedPath.startsWith(".")) {
    if (requestedPath.includes("*")) {
      requestedPath = ".";
    }
  }

  const maxDepth = params.maxDepth ?? 2;
  const includeHidden = params.includeHidden ?? false;
  let targetDir = path.resolve(workspaceRoot, requestedPath);

  try {
    let stats;
    try {
      stats = await fs.stat(targetDir);
    } catch {
      // If requested subfolder doesn't exist, fallback to workspace root
      targetDir = workspaceRoot;
      stats = await fs.stat(targetDir);
    }

    if (!stats.isDirectory()) {
      targetDir = path.dirname(targetDir);
    }

    const lines: string[] = [path.relative(workspaceRoot, targetDir) || "."];

    async function buildTree(currentDir: string, currentDepth: number, prefix: string) {
      if (currentDepth > maxDepth) return;
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      const filtered = entries.filter((e) => {
        if (!includeHidden && e.name.startsWith(".")) return false;
        if (DEFAULT_IGNORED_DIRS.has(e.name)) return false;
        return true;
      });

      // Sort directories first, then files
      filtered.sort((a, b) => {
        if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
        return a.isDirectory() ? -1 : 1;
      });

      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const branch = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";
        const entryPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          lines.push(`${prefix}${branch}${entry.name}/`);
          await buildTree(entryPath, currentDepth + 1, `${prefix}${childPrefix}`);
        } else {
          lines.push(`${prefix}${branch}${entry.name}`);
        }
      }
    }

    await buildTree(targetDir, 1, "");

    const output = lines.join("\n");
    // Frontier saving estimate: dumping full repos is ~8,000+ tokens. Bounded tree uses ~100 tokens.
    const tokensSaved = Math.max(1200, lines.length * 35);

    return {
      success: true,
      output,
      tokensSavedEstimate: tokensSaved,
      executionTimeMs: Date.now() - startTime,
      metadata: { fileCount: lines.length, maxDepth },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `check_tree failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * grep_code: Searches codebase files for regex patterns or text
 */
export async function executeGrepCode(params: GrepCodeParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const searchRoot = path.resolve(workspaceRoot, params.path || ".");
  const maxResults = params.maxResults ?? 20;

  try {
    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, "i");
    } catch {
      regex = new RegExp(escapeRegex(params.pattern), "i");
    }

    const matches: Array<{ file: string; line: number; text: string }> = [];

    async function searchDir(dir: string) {
      if (matches.length >= maxResults) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        if (DEFAULT_IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else if (entry.isFile()) {
          if (params.filePattern) {
            const ext = path.extname(entry.name);
            if (!params.filePattern.includes(ext) && !entry.name.includes(params.filePattern.replace("*", ""))) {
              continue;
            }
          }

          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const fileLines = content.split("\n");
            for (let idx = 0; idx < fileLines.length; idx++) {
              if (matches.length >= maxResults) break;
              if (regex.test(fileLines[idx])) {
                matches.push({
                  file: path.relative(workspaceRoot, fullPath),
                  line: idx + 1,
                  text: fileLines[idx].trim(),
                });
              }
            }
          } catch {
            // Ignore binary / unreadable files
          }
        }
      }
    }

    const rootStats = await fs.stat(searchRoot);
    if (rootStats.isFile()) {
      const content = await fs.readFile(searchRoot, "utf-8");
      const fileLines = content.split("\n");
      for (let idx = 0; idx < fileLines.length; idx++) {
        if (matches.length >= maxResults) break;
        if (regex.test(fileLines[idx])) {
          matches.push({
            file: path.relative(workspaceRoot, searchRoot),
            line: idx + 1,
            text: fileLines[idx].trim(),
          });
        }
      }
    } else {
      await searchDir(searchRoot);
    }

    if (matches.length === 0) {
      return {
        success: false,
        output: `No matches found for pattern: "${params.pattern}" in '${params.path || "."}'.`,
        error: "0_MATCHES",
        tokensSavedEstimate: 500,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const formatted = matches
      .map((m) => `${m.file}:${m.line}  ${m.text}`)
      .join("\n");

    const tokensSaved = 1500 + matches.length * 60;

    return {
      success: true,
      output: `Found ${matches.length} matches:\n${formatted}`,
      tokensSavedEstimate: tokensSaved,
      executionTimeMs: Date.now() - startTime,
      metadata: { matchCount: matches.length },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `grep_code failed: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * find_files: Locates files matching glob pattern
 */
export async function executeFindFiles(params: FindFilesParams, workspaceRoot: string): Promise<ToolResult> {
  const startTime = Date.now();
  const baseDir = path.resolve(workspaceRoot, params.cwd || ".");

  try {
    const rawPattern = params.glob || (params as Record<string, unknown>).path as string || "*";
    const targetPattern = rawPattern.replace(/^[*/]+/, "");
    const matchedFiles: string[] = [];

    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspaceRoot, fullPath);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          if (relPath.includes(targetPattern) || entry.name.endsWith(targetPattern)) {
            matchedFiles.push(relPath);
          }
        }
      }
    }

    await scan(baseDir);

    if (matchedFiles.length === 0) {
      return {
        success: false,
        output: `No files matched pattern '${params.glob}'`,
        error: "NO_FILES_FOUND",
        tokensSavedEstimate: 300,
        executionTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      output: matchedFiles.join("\n"),
      tokensSavedEstimate: 800 + matchedFiles.length * 20,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      error: `find_files error: ${errorMsg}`,
      tokensSavedEstimate: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
