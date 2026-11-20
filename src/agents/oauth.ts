import { requestUrl } from "obsidian";
import { rec, str } from "./guards";
import { b64url, randomBytes, sha256Digest } from "./web-utils";

/**
 * 移动端 OAuth：
 * - Anthropic：手动码流程（浏览器授权页 → 复制 code → 粘贴回插件交换令牌），无本地回调服务器。
 * - 令牌刷新：requestUrl 直连官方 token 端点。
 * 流程参数来自各官方 CLI 的公开实现（Claude Code / Codex）。
 */
export interface OAuthProvider {
  id: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  scope: string;
  extraAuthorize?: Record<string, string>;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  anthropic: {
    id: "anthropic",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    scope: "org:create_api_key user:profile user:inference",
    extraAuthorize: { code: "true" },
  },
  openai: {
    id: "openai",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    scope: "openid profile email offline_access",
    extraAuthorize: { id_token_add_organizations: "true", codex_cli_simplified_flow: "true" },
  },
};

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const ANTHROPIC_REDIRECT = "https://console.anthropic.com/oauth/code/callback";

/** 构造 Anthropic 手动码授权 URL（PKCE S256）；调用方打开浏览器，用户复制页面展示的 code */
export async function buildAnthropicAuthUrl(): Promise<{ url: string; verifier: string; state: string }> {
  const p = OAUTH_PROVIDERS.anthropic;
  const verifier = b64url(randomBytes(64));
  const challenge = b64url(await sha256Digest(verifier));
  const state = b64url(randomBytes(24));
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    redirect_uri: ANTHROPIC_REDIRECT,
    scope: p.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(p.extraAuthorize ?? {}),
  });
  return { url: `${p.authorizeUrl}?${q.toString()}`, verifier, state };
}

/** 用用户粘贴的授权码交换令牌（code 可能为 "code#state" 形态） */
export async function exchangeAnthropicCode(code: string, verifier: string, state: string): Promise<OAuthTokens> {
  const p = OAUTH_PROVIDERS.anthropic;
  const trimmed = code.trim();
  const hash = trimmed.indexOf("#");
  const rawCode = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
  const rawState = hash >= 0 ? trimmed.slice(hash + 1) : state;
  if (!rawCode) throw new Error("Empty authorization code / 授权码为空");
  const r = await requestUrl({
    url: p.tokenUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: rawCode,
      redirect_uri: ANTHROPIC_REDIRECT,
      client_id: p.clientId,
      code_verifier: verifier,
      state: rawState,
    }),
    throw: false,
  });
  let j: Record<string, unknown> = {};
  try {
    j = rec(JSON.parse(r.text));
  } catch {
    /* 非 JSON 响应 */
  }
  if (r.status < 200 || r.status >= 300 || !j.access_token) throw new Error(`OAuth token exchange failed / 令牌交换失败 HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return {
    accessToken: str(j.access_token),
    refreshToken: str(j.refresh_token),
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
}

/** 刷新令牌 */
export async function oauthRefresh(providerId: string, refreshToken: string): Promise<OAuthTokens> {
  const p = OAUTH_PROVIDERS[providerId];
  const r = await requestUrl({
    url: p.tokenUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: p.clientId }),
    throw: false,
  });
  let j: Record<string, unknown> = {};
  try {
    j = rec(JSON.parse(r.text));
  } catch {
    /* 非 JSON 响应 */
  }
  if (r.status < 200 || r.status >= 300 || !j.access_token) throw new Error(`OAuth refresh failed / 刷新失败 HTTP ${r.status}`);
  return {
    accessToken: str(j.access_token),
    refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : refreshToken,
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
}