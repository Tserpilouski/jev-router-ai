import { useState, useEffect, useRef } from "react";
import { Activity, ShieldCheck, Cpu, Zap, ArrowRight, RefreshCw, Terminal, CheckCircle, AlertTriangle, Send } from "lucide-react";

interface TimelineItem {
  id: string;
  type: string;
  hopIndex?: number;
  action?: string;
  parameters?: Record<string, unknown>;
  output?: string;
  reason?: string;
  tokensSaved?: number;
  timestamp: string;
}

export default function App() {
  const [connected, setConnected] = useState<boolean>(false);
  const [tokensSaved, setTokensSaved] = useState<number>(0);
  const [decisionHops, setDecisionHops] = useState<number>(0);
  const [avgLatency, setAvgLatency] = useState<number>(0);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [promptText, setPromptText] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        const ws = new WebSocket("ws://localhost:3001");
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleTelemetryEvent(data);
          } catch {
            // Ignore non-json
          }
        };

        ws.onclose = () => {
          setConnected(false);
          reconnectTimeout = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          setConnected(false);
        };
      } catch {
        setConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  function handleSendPrompt(customPrompt?: string) {
    const textToSend = customPrompt || promptText;
    if (!textToSend.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setIsProcessing(true);
    wsRef.current.send(JSON.stringify({ type: "prompt", prompt: textToSend.trim() }));
    if (!customPrompt) setPromptText("");
  }

  function handleTelemetryEvent(event: any) {
    const time = new Date().toLocaleTimeString();

    if (event.type === "router:action_dispatched") {
      setDecisionHops((prev) => prev + 1);
      setTimeline((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          type: "action",
          hopIndex: event.payload.hopIndex,
          action: event.payload.action,
          parameters: event.payload.parameters,
          reason: event.payload.reasoning,
          timestamp: time,
        },
        ...prev.slice(0, 24),
      ]);
    } else if (event.type === "router:tool_output") {
      if (event.payload.tokensSaved) {
        setTokensSaved((prev) => prev + Number(event.payload.tokensSaved));
      }
      if (event.payload.executionTimeMs) {
        setAvgLatency((prev) => (prev === 0 ? event.payload.executionTimeMs : Math.round((prev + event.payload.executionTimeMs) / 2)));
      }
    } else if (event.type === "router:self_redirect") {
      setTimeline((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          type: "redirect",
          hopIndex: event.payload.hopIndex,
          reason: `${event.payload.reason} -> ${event.payload.suggestion || ""}`,
          timestamp: time,
        },
        ...prev.slice(0, 24),
      ]);
    } else if (event.type === "router:completed") {
      setIsProcessing(false);
      setTimeline((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          type: "completed",
          reason: event.payload.message,
          timestamp: time,
        },
        ...prev.slice(0, 24),
      ]);
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#e2e8f0", padding: "24px", fontFamily: "sans-serif" }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b", paddingBottom: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: "8px", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>jev-router-ai</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Real-Time Action Router & Telemetry Hub</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1e293b", padding: "6px 12px", borderRadius: "20px", fontSize: "12px" }}>
            <Cpu size={14} color="#38bdf8" />
            <span>Local: <strong>smollm2:135m</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1e293b", padding: "6px 12px", borderRadius: "20px", fontSize: "12px" }}>
            <Zap size={14} color="#a855f7" />
            <span>Frontier: <strong>Gemini</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: connected ? "#22c55e" : "#ef4444" }}></span>
            <span style={{ color: connected ? "#22c55e" : "#94a3b8" }}>{connected ? "Server Connected" : "Connecting..."}</span>
          </div>
        </div>
      </header>

      {/* Interactive Web Prompt Bar */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendPrompt();
          }}
          style={{ display: "flex", gap: "10px" }}
        >
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Wpisz zadanie np. Sprawdź strukturę katalogu packages, Szukaj RouterEngine w kodzie..."
            disabled={!connected || isProcessing}
            style={{
              flex: 1,
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#f8fafc",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!connected || isProcessing || !promptText.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: connected && !isProcessing ? "#3b82f6" : "#475569",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "0 20px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: connected && !isProcessing ? "pointer" : "not-allowed",
            }}
          >
            {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            <span>{isProcessing ? "Routing..." : "Wyślij ⚡"}</span>
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Przykłady:</span>
          {[
            "Sprawdź strukturę katalogu packages",
            "Znajdź pliki json w projekcie",
            "Szukaj RouterEngine w kodzie",
            "Pokaż outline pliku packages/router/src/index.ts",
          ].map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={!connected || isProcessing}
              onClick={() => handleSendPrompt(chip)}
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "14px",
                padding: "4px 10px",
                fontSize: "11px",
                color: "#94a3b8",
                cursor: "pointer",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: "13px", marginBottom: "8px" }}>
            <span>Est. Tokens Saved</span>
            <ShieldCheck size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#10b981" }}>{tokensSaved.toLocaleString()}</div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>0 API token local actions</div>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: "13px", marginBottom: "8px" }}>
            <span>Decision Hops</span>
            <Activity size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#3b82f6" }}>{decisionHops}</div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Autonomous routing steps</div>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: "13px", marginBottom: "8px" }}>
            <span>Average Latency</span>
            <Activity size={18} color="#a855f7" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#a855f7" }}>{avgLatency} ms</div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Tool execution speed</div>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#9ca3af", fontSize: "13px", marginBottom: "8px" }}>
            <span>Escalation Target</span>
            <ArrowRight size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#f59e0b" }}>Gemini</div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Frontier fallback engine</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
        {/* Real-time Decision Timeline */}
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <RefreshCw size={16} color="#38bdf8" /> Live Decision Pipeline
            </h2>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>Adaptive Self-Redirection</span>
          </div>

          {timeline.length === 0 ? (
            <div style={{ border: "1px dashed #374151", borderRadius: "8px", padding: "32px", textAlign: "center", color: "#6b7280" }}>
              <Terminal size={32} style={{ margin: "0 auto 12px auto", opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}>Gotowy do przyjmowania promptów</p>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px" }}>Wpisz polecenie w pasku u góry lub kliknij jeden z przykładów</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {timeline.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "12px 14px",
                    background: item.type === "redirect" ? "#2a1525" : item.type === "completed" ? "#122a1e" : "#1e293b",
                    borderLeft: `4px solid ${item.type === "redirect" ? "#f43f5e" : item.type === "completed" ? "#10b981" : "#38bdf8"}`,
                    borderRadius: "6px",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {item.type === "redirect" ? (
                        <AlertTriangle size={14} color="#f43f5e" />
                      ) : item.type === "completed" ? (
                        <CheckCircle size={14} color="#10b981" />
                      ) : (
                        <Zap size={14} color="#38bdf8" />
                      )}
                      <strong style={{ color: item.type === "redirect" ? "#f43f5e" : item.type === "completed" ? "#10b981" : "#38bdf8" }}>
                        {item.type === "redirect" ? "Self-Redirection" : item.type === "completed" ? "Ukończono zadanie" : `Hop #${item.hopIndex}: ${item.action}`}
                      </strong>
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>{item.timestamp}</span>
                  </div>
                  {item.reason && <p style={{ margin: "4px 0 0 0", color: "#cbd5e1" }}>{item.reason}</p>}
                  {item.parameters && (
                    <div style={{ marginTop: "6px", fontFamily: "monospace", fontSize: "11px", color: "#94a3b8", background: "#0f172a", padding: "4px 8px", borderRadius: "4px" }}>
                      {JSON.stringify(item.parameters)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Local Toolset & Status */}
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 16px 0" }}>Local Action Toolset</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { name: "grep_code", cat: "Discovery (0 Tokens)" },
              { name: "check_tree", cat: "Discovery (0 Tokens)" },
              { name: "find_files", cat: "Discovery (0 Tokens)" },
              { name: "outline_file", cat: "Context (0 Tokens)" },
              { name: "check_context", cat: "Context (0 Tokens)" },
              { name: "edit_file", cat: "Modification (0 Tokens)" },
              { name: "create_file", cat: "Modification (0 Tokens)" },
              { name: "run_check", cat: "Verification (0 Tokens)" },
              { name: "run_tests", cat: "Verification (0 Tokens)" },
              { name: "escalate", cat: "Escalation (Gemini)" },
            ].map((t) => (
              <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#1f2937", borderRadius: "6px", fontSize: "12px" }}>
                <span style={{ fontFamily: "monospace", color: "#38bdf8" }}>{t.name}</span>
                <span style={{ color: "#9ca3af", fontSize: "11px" }}>{t.cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
