export type PermissionMode = "confirm" | "full";
export type ToolTier = "read" | "write" | "danger";

export interface ToolDef {
  name: string;
  description: string;
  tier: ToolTier;
  /** 联网类工具，可在设置中整体禁用 */
  network?: boolean;
  inputSchema: Record<string, unknown>;
}

export interface ConfirmRequest {
  tool: string;
  tier: ToolTier;
  args: Record<string, unknown>;
  summary: string;
}

export type ConfirmDecision = "allow" | "deny" | "allow-session";

/** 由 UI 提供：弹出确认框，返回用户决定 */
export type ConfirmHandler = (req: ConfirmRequest) => Promise<ConfirmDecision>;

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; text: string; isError?: boolean }
  | { type: "done"; text: string }
  | { type: "error"; text: string };

export interface RunContext {
  prompt: string;
  model: string;
  vaultName: string;
  systemPrompt: string;
  signal: AbortSignal;
  onEvent: (e: AgentEvent) => void;
}

/** 内置协议 agent：无需外部 CLI，插件内直接完成鉴权与模型调用 */
export interface NativeAgentSpec {
  kind: "native";
  id: string;
  label: string;
  protocol: "cosy" | "anthropic" | "openai" | "openai-compat";
  /** cosy 站点 id（qwenwork / qoder-cn） */
  site?: string;
  /** 凭据获取方式 */
  cred: "device" | "device+pat" | "key" | "key+oauth";
  /** 官方 OAuth 提供方 */
  oauth?: "anthropic" | "openai";
  /** 移动端登录方式标记：manual-code = 浏览器授权 + 手动粘贴授权码 */
  mobileAuth?: "manual-code";
  baseUrl?: string;
  models: string[];
  dynamic?: "cosy" | "anthropic" | "openai";
}

export type AgentSpec = NativeAgentSpec;

export interface AgentCredential {
  apiKey?: string;
  pat?: string;
  oauthToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  baseUrl?: string;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface StoredMessage {
  role: "user" | "assistant" | "error" | "tool";
  text?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  ts: number;
}

export interface Conversation {
  id: string;
  title: string;
  agentId: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

export interface AgentHubSettings {
  permissionMode: PermissionMode;
  networkTools: boolean;
  language: "auto" | "zh" | "en";
  confirmTimeoutSec: number;
  selectedAgent: string;
  selectedModels: Record<string, string>;
  credentials: Record<string, AgentCredential>;
}

export const DEFAULT_SETTINGS: AgentHubSettings = {
  permissionMode: "confirm",
  networkTools: true,
  language: "auto",
  confirmTimeoutSec: 180,
  selectedAgent: "qwenwork",
  selectedModels: {},
  credentials: {},
};