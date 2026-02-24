import { MCPServer, text, object, error, widget } from "mcp-use/server";
import { z } from "zod";

const server = new MCPServer({
  name: "browser-use-live",
  title: "Browser Use Live",
  version: "1.0.0",
  description: "Run browser tasks via Browser Use Cloud and watch them live in ChatGPT",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://browser-use.com",
  icons: [{ src: "icon.svg", mimeType: "image/svg+xml", sizes: ["512x512"] }],
});

const BROWSER_USE_API = "https://api.browser-use.com/mcp";
const API_KEY = process.env.BROWSER_USE_API_KEY || "";

async function callBrowserUseAPI(method: string, params: Record<string, unknown>) {
  const res = await fetch(BROWSER_USE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Browser-Use-API-Key": API_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      id: Date.now(),
      params,
    }),
  });

  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  const json = await res.json() as { result?: { content?: Array<{ text: string }> }; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  const text = json.result?.content?.[0]?.text;
  if (!text) throw new Error("Empty response from API");
  return JSON.parse(text);
}

// ── Tool: run_browser_task ───────────────────────────────────────────────────

server.tool(
  {
    name: "run_browser_task",
    description: "Run a browser automation task in the cloud and watch it live. Opens a live browser session you can watch in real-time.",
    schema: z.object({
      task: z.string().describe("What you want the browser to do, e.g. 'Go to google.com and search for AI news'"),
      model: z.enum([
        "browser-use-2.0", "gpt-4.1", "gpt-4.1-mini", "o4-mini",
        "gemini-2.5-flash", "claude-sonnet-4-6",
      ]).optional().default("browser-use-2.0").describe("LLM model to use"),
      max_steps: z.number().int().min(1).max(100).optional().default(20).describe("Max browser steps"),
    }),
    widget: {
      name: "browser-live-view",
      invoking: "Starting cloud browser...",
      invoked: "Browser session live",
    },
  },
  async ({ task, model, max_steps }) => {
    if (!API_KEY) {
      return error("BROWSER_USE_API_KEY environment variable is not set");
    }

    try {
      const result = await callBrowserUseAPI("tools/call", {
        name: "browser_task",
        arguments: { task, model, max_steps },
      });

      return widget({
        props: {
          taskId: result.task_id as string,
          sessionId: result.session_id as string,
          liveUrl: result.live_url as string,
          task,
          model: model ?? "browser-use-2.0",
        },
        output: text(
          `Browser task started — watching live in the widget. Task ID: ${result.task_id}`
        ),
      });
    } catch (err) {
      return error(`Failed to start browser task: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);


// ── Tool: get_task_result ────────────────────────────────────────────────────

server.tool(
  {
    name: "get_task_result",
    description: "Check the status of a running browser task. Returns result when complete, or null if still running.",
    schema: z.object({
      task_id: z.string().describe("Task ID from run_browser_task"),
    }),
  },
  async ({ task_id }) => {
    if (!API_KEY) return error("BROWSER_USE_API_KEY not set");
    try {
      const status = await callBrowserUseAPI("tools/call", {
        name: "monitor_task",
        arguments: { task_id },
      });
      return object({
        isSuccess: status.is_success as boolean | null,
        taskOutput: status.task_output as string | null,
        totalSteps: (status.total_steps as number) ?? 0,
        done: status.is_success !== null,
      });
    } catch (err) {
      return error(`Failed to get task result: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

// ── Custom HTTP endpoint — polled directly by the widget via fetch ───────────

server.app.get("/api/task/:taskId", async (c) => {
  const taskId = c.req.param("taskId");
  try {
    const res = await fetch("https://api.browser-use.com/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        id: Date.now(),
        params: { name: "monitor_task", arguments: { task_id: taskId } },
      }),
    });
    const json = await res.json() as { result?: { content?: Array<{ text: string }> } };
    const data = JSON.parse(json.result?.content?.[0]?.text ?? "{}");
    return c.json({
      done: data.is_success !== null && data.is_success !== undefined,
      isSuccess: data.is_success ?? null,
      taskOutput: data.task_output ?? null,
      totalSteps: data.total_steps ?? 0,
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

server.listen().then(() => {
  console.log("Browser Use Live MCP server running");
});
