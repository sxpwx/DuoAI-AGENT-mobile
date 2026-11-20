import { requestUrl } from "obsidian";
import { RunContext } from "../types";
import { TOOL_DEFS } from "../bridge/tools";
import { t } from "../i18n";
import { arr, rec, str } from "./guards";
import { uuidv4 } from "./web-utils";

type ExecFn = (name: string, args: Record<string, unknown>) => Promise<string>;

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

interface ChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** OpenAI 消息 → Responses API input items */
function toInput(messages: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "input_text", text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }] });
    } else if (m.role === "assistant") {
      if (m.content) out.push({ role: "assistant", content: [{ type: "output_text", text: String(m.content) }] });
      for (const tc of m.tool_calls ?? []) {
        out.push({ type: "function_call", call_id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments ?? "{}" });
      }
    } else if (m.role === "tool") {
      out.push({ type: "function_call_output", call_id: m.tool_call_id, output: String(m.content ?? "") });
    }
  }
  return out;
}

/** Codex（ChatGPT 订阅 OAuth）agent 循环：不限轮数 */
export async function runCodexOAuthLoop(
  accessToken: string,
  ctx: RunContext,
  execute: ExecFn,
  networkEnabled = true,
  onRefresh?: () => Promise<string | null>
): Promise<void> {
  const tools = TOOL_DEFS.filter((tl) => !tl.network || networkEnabled).map((tl) => ({
    type: "function",
    name: tl.name,
    description: tl.description,
    parameters: tl.inputSchema,
    strict: false,
  }));
  const messages: ChatMessage[] = [
    { role: "system", content: ctx.systemPrompt },
    { role: "user", content: ctx.prompt },
  ];
  let token = accessToken;
  const sessionId = uuidv4();

  let refreshed = false;
  for (let iter = 1; ; iter++) {
    if (ctx.signal.aborted) return;
    ctx.onEvent({ type: "status", text: t("statusRequestRound", { n: iter }) });

    let content = "";
    let completed = false;
    const calls = new Map<string, { call_id: string; name: string; args: string }>();
    try {
      const res = await requestUrl({
        url: ENDPOINT,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "OpenAI-Beta": "responses=experimental",
          originator: "codex_cli_rs",
          session_id: sessionId,
        },
        body: JSON.stringify({
          model: ctx.model,
          instructions: ctx.systemPrompt,
          input: toInput(messages),
          tools,
          stream: false,
          store: false,
        }),
        throw: false,
      });
      if (ctx.signal.aborted) return;
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);
      }
      const e = rec(JSON.parse(res.text));
      if (str(e.status) === "failed" || e.error) {
        ctx.onEvent({ type: "error", text: String(rec(e.error).message ?? e.message ?? "Codex API error") });
        return;
      }
      completed = true;
      for (const itemRaw of arr(e.output)) {
        const item = rec(itemRaw);
        if (item.type === "message") {
          for (const partRaw of arr(item.content)) {
            const part = rec(partRaw);
            if (part.type === "output_text" && str(part.text)) {
              content += str(part.text);
              ctx.onEvent({ type: "text", text: str(part.text) });
            }
          }
        } else if (item.type === "function_call") {
          calls.set(str(item.id ?? item.call_id), {
            call_id: str(item.call_id),
            name: str(item.name),
            args: str(item.arguments),
          });
        }
      }
    } catch (e) {
      if (ctx.signal.aborted) return;
      const msg = String(rec(e).message ?? e);
      if (msg.includes("401") && onRefresh && !refreshed) {
        const nt = await onRefresh();
        if (nt) {
          token = nt;
          refreshed = true;
          continue;
        }
      }
      ctx.onEvent({ type: "error", text: msg.startsWith("HTTP") ? `Codex API ${msg}` : `Network / 网络: ${msg}` });
      return;
    }

    const list = [...calls.values()].filter((c) => c.name);
    if (completed && list.length) {
      const assistantContent: Record<string, unknown>[] = [];
      if (content) assistantContent.push({ type: "output_text", text: content });
      messages.push({
        role: "assistant",
        content: content || "",
        tool_calls: list.map((c) => ({ id: c.call_id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })),
      });
      for (const c of list) {
        if (ctx.signal.aborted) return;
        let args: Record<string, unknown> = {};
        try {
          args = rec(JSON.parse(c.args || "{}"));
        } catch {
          /* tool-side error */
        }
        ctx.onEvent({ type: "tool_use", name: c.name, args });
        try {
          const result = await execute(c.name, args);
          ctx.onEvent({ type: "tool_result", text: result.slice(0, 600) });
          messages.push({ role: "tool", tool_call_id: c.call_id, content: result });
        } catch (e) {
          const msg = String(rec(e).message ?? e);
          ctx.onEvent({ type: "tool_result", text: msg, isError: true });
          messages.push({ role: "tool", tool_call_id: c.call_id, content: `Error / 错误: ${msg}` });
        }
      }
      continue;
    }
    ctx.onEvent({ type: "done", text: content });
    return;
  }
}