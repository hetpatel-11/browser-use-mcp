import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { useEffect, useState } from "react";
import { z } from "zod";

const propsSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  liveUrl: z.string(),
  taskStatusApiUrl: z.string(),
  task: z.string(),
  model: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Live browser session viewer — streams real-time browser automation",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Starting cloud browser...",
    invoked: "Browser session live",
  },
};

type Props = z.infer<typeof propsSchema>;

type TaskResult = {
  isSuccess: boolean | null;
  taskOutput: string | null;
  totalSteps: number;
  done: boolean;
  error?: string;
};

export default function BrowserLiveView() {
  const { props, isPending } = useWidget<Props>();
  const [iframeError, setIframeError] = useState(false);
  const [result, setResult] = useState<TaskResult | null>(null);

  // Poll the server directly via fetch — works independently of ChatGPT's session
  useEffect(() => {
    if (isPending) return;
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(props.taskStatusApiUrl);
        if (!res.ok) {
          setResult({
            done: true,
            isSuccess: false,
            totalSteps: 0,
            taskOutput: null,
            error: `Status check failed (${res.status})`,
          });
          stopped = true;
          return;
        }
        const data: TaskResult = await res.json();
        setResult(data);
        if (data.done) stopped = true;
      } catch { /* ignore transient errors */ }
    };

    poll();
    const interval = setInterval(() => { if (!stopped) poll(); }, 4000);
    return () => { stopped = true; clearInterval(interval); };
  }, [isPending, props.taskStatusApiUrl]);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={s.container}>
          <div style={s.loadingState}>
            <div style={s.pulsingDot} />
            <span style={s.loadingText}>Starting cloud browser...</span>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const finalMessage =
    result?.taskOutput?.trim() ||
    (result?.done
      ? (result.isSuccess
        ? "Task completed successfully, but Browser Use did not return a final text output."
        : result.error || "Task failed before a final output was returned.")
      : null);

  return (
    <McpUseProvider autoSize>
      <div style={s.container}>

        {/* Top bar */}
        <div style={s.topBar}>
          <div style={s.topBarLeft}>
            <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
              <div style={{ ...s.statusDot, backgroundColor: result?.done ? (result.isSuccess ? "#4ade80" : "#f87171") : "#f87171" }} />
              {!result?.done && <div style={{ ...s.statusPulse, backgroundColor: "#f87171" }} />}
            </div>
            <span style={s.statusText}>
              {result?.done ? (result.isSuccess ? "Complete" : "Failed") : "Live"}
            </span>
            {result?.done && <span style={s.divider}>·</span>}
            {result?.done && <span style={{ ...s.modelChip, color: result.isSuccess ? "#4ade80" : "#f87171", borderColor: result.isSuccess ? "#1a3a1a" : "#3a1a1a", backgroundColor: result.isSuccess ? "#0a1a0a" : "#1a0a0a" }}>{result.totalSteps} steps</span>}
            <span style={s.divider}>·</span>
            <span style={s.modelChip}>{props.model}</span>
          </div>
          <a href={props.liveUrl} target="_blank" rel="noopener noreferrer" style={s.openBtn}>
            Open in tab →
          </a>
        </div>

        {/* Task label */}
        <div style={s.taskRow}>
          <span style={s.taskKicker}>TASK</span>
          <span style={s.taskText}>{props.task}</span>
        </div>

        {/* Live iframe */}
        {!iframeError ? (
          <div style={s.viewport}>
            <iframe
              src={props.liveUrl}
              style={s.iframe}
              title="Live Browser Session"
              onError={() => setIframeError(true)}
              allow="autoplay"
            />
            <div style={s.scanlineOverlay} />
          </div>
        ) : (
          <div style={s.fallback}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <p style={s.fallbackText}>Live view requires a new tab</p>
            <a href={props.liveUrl} target="_blank" rel="noopener noreferrer" style={s.fallbackBtn}>
              Watch Live Session →
            </a>
          </div>
        )}

        {/* Result — shown once task completes */}
        {result?.done && finalMessage && (
          <div style={{ ...s.resultBanner, borderLeftColor: result.isSuccess ? "#4ade80" : "#f87171" }}>
            <span style={{ ...s.resultKicker, color: result.isSuccess ? "#4ade80" : "#f87171" }}>
              {result.isSuccess ? "RESULT" : "ERROR"}
            </span>
            <p style={s.resultText}>{finalMessage}</p>
          </div>
        )}

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.footerItem}>
            <span style={s.footerLabel}>SESSION</span>
            {props.sessionId.slice(0, 8)}…
          </span>
          <span style={s.footerItem}>
            <span style={s.footerLabel}>TASK ID</span>
            {props.taskId.slice(0, 8)}…
          </span>
        </div>

      </div>
    </McpUseProvider>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const s: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    backgroundColor: "#0a0a0a",
    border: "1px solid #1f1f1f",
    borderRadius: 12,
    overflow: "hidden",
    maxWidth: 700,
    color: "#fff",
  },
  loadingState: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 16px",
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#fbbf24",
  },
  loadingText: {
    fontSize: 13,
    color: "#555",
    letterSpacing: "0.01em",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid #1a1a1a",
    backgroundColor: "#0d0d0d",
  },
  topBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    position: "absolute",
    top: 0,
    left: 0,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0.4,
    animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
    transform: "scale(2.2)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: 500,
    color: "#d4d4d4",
    letterSpacing: "0.02em",
  },
  divider: {
    color: "#333",
    fontSize: 12,
  },
  modelChip: {
    fontSize: 11,
    color: "#737373",
    backgroundColor: "#161616",
    border: "1px solid #222",
    padding: "2px 8px",
    borderRadius: 4,
    letterSpacing: "0.02em",
  },
  openBtn: {
    fontSize: 12,
    fontWeight: 500,
    color: "#e5e5e5",
    textDecoration: "none",
    padding: "5px 12px",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    backgroundColor: "#141414",
    letterSpacing: "0.02em",
  },
  taskRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "9px 14px",
    borderBottom: "1px solid #141414",
  },
  taskKicker: {
    fontSize: 9,
    fontWeight: 700,
    color: "#404040",
    letterSpacing: "0.12em",
    flexShrink: 0,
  },
  taskText: {
    fontSize: 13,
    color: "#a3a3a3",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  viewport: {
    position: "relative",
    width: "100%",
    height: 420,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
  },
  scanlineOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
    pointerEvents: "none",
  },
  fallback: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "52px 24px",
    backgroundColor: "#080808",
    height: 220,
  },
  fallbackText: {
    fontSize: 13,
    color: "#555",
    margin: 0,
  },
  fallbackBtn: {
    padding: "9px 20px",
    backgroundColor: "#fff",
    color: "#000",
    borderRadius: 7,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.01em",
  },
  resultBanner: {
    borderLeft: "2px solid",
    padding: "12px 14px",
    backgroundColor: "#080808",
    borderTop: "1px solid #141414",
  },
  resultKicker: {
    display: "block",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.12em",
    marginBottom: 5,
  },
  resultText: {
    fontSize: 13,
    color: "#d4d4d4",
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  footer: {
    display: "flex",
    borderTop: "1px solid #141414",
    backgroundColor: "#080808",
  },
  footerItem: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flex: 1,
    padding: "8px 14px",
    fontSize: 11,
    color: "#404040",
    borderRight: "1px solid #141414",
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#2a2a2a",
    letterSpacing: "0.1em",
  },
};
