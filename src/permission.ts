import { ConfirmHandler, PermissionMode } from "./types";
import { TOOL_DEFS, VaultTools, summarize } from "./bridge/tools";
import { t } from "./i18n";

/**
 * 移动端权限网关：内置协议 agent 循环的工具调用统一经过这里。
 * 三级权限：read 免确认；write/danger 需确认（最高权限模式或会话级放行时直接执行）；
 * 联网工具受设置开关约束。逻辑与桌面版 bridge/server.ts 的 executeGated 一致。
 */
export class PermissionGate {
  private sessionAllowAll = false;

  constructor(
    private tools: VaultTools,
    private getMode: () => PermissionMode,
    private confirm: ConfirmHandler,
    private getNetwork: () => boolean = () => true
  ) {}

  resetSession() {
    this.sessionAllowAll = false;
  }

  async executeGated(name: string, args: Record<string, unknown>): Promise<string> {
    const def = TOOL_DEFS.find((t) => t.name === name);
    if (!def) throw new Error(`未知工具：${name}`);
    if (def.network && !this.getNetwork()) throw new Error(t("networkDisabled"));
    const tier = def.tier;
    const mode = this.getMode();
    if (mode === "confirm" && tier !== "read" && !this.sessionAllowAll) {
      const d = await this.confirm({ tool: name, tier, args, summary: summarize(name, args) });
      if (d === "allow-session") this.sessionAllowAll = true;
      if (d === "deny") throw new Error(t("refusedByUser"));
    }
    return await this.tools.execute(name, args);
  }
}