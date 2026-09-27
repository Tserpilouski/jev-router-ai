#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import pc from "picocolors";
import { RouterEngine, TelemetryEvent } from "@jev-router-ai/router";
import { TelemetryServer } from "./server.js";

async function main() {
  const telemetryPort = Number(process.env.TELEMETRY_PORT) || 3001;
  let router: RouterEngine;

  const telemetryServer = new TelemetryServer(telemetryPort, async (webPrompt: string) => {
    console.log(pc.cyan(`\n[Web Dashboard Ingress] > ${webPrompt}`));
    if (router) {
      await router.runPrompt(webPrompt);
    }
  });

  try {
    await telemetryServer.start();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(pc.yellow(`[Warning] Could not start WebSocket server on :${telemetryPort}: ${errorMsg}`));
  }

  router = new RouterEngine({
    workspaceRoot: process.cwd(),
    maxHops: 6,
    onTelemetry: (event: TelemetryEvent) => {
      telemetryServer.broadcast(event);
      renderTelemetryToConsole(event);
    },
  });

  console.clear();
  console.log(pc.cyan(pc.bold("\n⚡ ===================================================")));
  console.log(pc.cyan(pc.bold("         JEV-ROUTER-AI • INTERACTIVE CLI REPL        ")));
  console.log(pc.cyan(pc.bold("===================================================\n")));
  console.log(pc.green("✔") + pc.bold(" Local Router: ") + pc.white("Ollama (smollm2:135m)"));
  console.log(pc.green("✔") + pc.bold(" Frontier Model: ") + pc.white("Google Gemini (gemini-2.5-flash)"));
  console.log(pc.green("✔") + pc.bold(" Telemetry WS: ") + pc.cyan(`ws://localhost:${telemetryPort}`));
  console.log(pc.green("✔") + pc.bold(" Web Dashboard: ") + pc.cyan("http://localhost:3000\n"));
  console.log(pc.dim("Wpisz polecenie (np. 'sprawdz pliki w folderze packages', 'szukaj RouterEngine')"));
  console.log(pc.dim("Wpisz 'exit' lub 'quit', aby wyjść.\n"));

  const rl = readline.createInterface({ input, output });

  while (true) {
    let promptText: string;
    try {
      promptText = await rl.question(pc.bold(pc.magenta("> Enter prompt: ")));
    } catch {
      break;
    }

    const trimmed = promptText.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      console.log(pc.dim("\nZamykanie jev-router-ai. Do widzenia!"));
      telemetryServer.stop();
      rl.close();
      process.exit(0);
    }

    console.log();
    try {
      const state = await router.runPrompt(trimmed);

      console.log(pc.bold(pc.green("\n[Router Result]")));
      console.log(pc.white(state.finalResult || "Workflow completed."));

      console.log(pc.dim("─".repeat(60)));
      console.log(
        pc.cyan(
          `[Telemetry] Hops: ${state.hops.length} | Latency: ${state.totalLatencyMs}ms | Tokens Saved: ~${state.totalTokensSavedEstimate.toLocaleString()}`
        )
      );
      if (state.totalFrontierTokensBurned > 0) {
        console.log(pc.yellow(`[Frontier Burned] ${state.totalFrontierTokensBurned.toLocaleString()} tokens`));
      }
      console.log(pc.dim("─".repeat(60)) + "\n");
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`\n[Execution Error] ${errStr}\n`));
    }
  }
}

function renderTelemetryToConsole(event: TelemetryEvent) {
  const { type, payload } = event;

  switch (type) {
    case "router:thinking":
      console.log(
        pc.blue(`[Router Thinking] `) +
          pc.dim(`Hop #${payload.hopIndex}${payload.feedback ? ` | Adaptive feedback: ${payload.feedback}` : ""}`)
      );
      break;

    case "router:action_dispatched":
      console.log(
        pc.yellow(`[Action Dispatched] `) +
          pc.bold(`${payload.action}`) +
          pc.dim(`: ${JSON.stringify(payload.parameters)}`)
      );
      if (payload.reasoning) {
        console.log(pc.dim(`   Rationale: ${payload.reasoning}`));
      }
      break;

    case "router:tool_output":
      if (payload.success) {
        console.log(
          pc.green(`[Tool Output] `) +
            pc.dim(
              `Completed in ${payload.executionTimeMs}ms (+~${payload.tokensSaved} tokens saved)\n` +
                String(payload.output || "")
                  .split("\n")
                  .slice(0, 5)
                  .map((l) => `   ${l}`)
                  .join("\n") +
                (String(payload.output || "").split("\n").length > 5 ? "\n   ..." : "")
            )
        );
      } else {
        console.log(pc.red(`[Tool Warning] `) + pc.dim(`Action returned error: ${payload.output || "Unsuccessful"}`));
      }
      break;

    case "router:self_redirect":
      console.log(
        pc.magenta(`[Self-Redirection] `) +
          pc.bold(String(payload.reason)) +
          (payload.suggestion ? pc.dim(` -> Suggestion: ${payload.suggestion}`) : "")
      );
      break;

    case "router:escalated":
      console.log(pc.red(pc.bold(`[Escalated to Frontier] `)) + String(payload.reason));
      break;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
