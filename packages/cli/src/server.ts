import { WebSocket, WebSocketServer } from "ws";
import { TelemetryEvent } from "@jev-router-ai/router";

export class TelemetryServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private onPromptHandler?: (prompt: string) => Promise<void>;

  constructor(port = 3001, onPrompt?: (prompt: string) => Promise<void>) {
    this.port = port;
    this.onPromptHandler = onPrompt;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port }, () => {
          resolve();
        });

        this.wss.on("connection", (ws) => {
          ws.on("message", async (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.type === "prompt" && msg.prompt && this.onPromptHandler) {
                await this.onPromptHandler(msg.prompt);
              }
            } catch (err) {
              console.error("Error handling incoming WS message:", err);
            }
          });
        });

        this.wss.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  broadcast(event: TelemetryEvent) {
    if (!this.wss) return;
    const message = JSON.stringify(event);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch {
          // Ignore closed clients
        }
      }
    });
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
