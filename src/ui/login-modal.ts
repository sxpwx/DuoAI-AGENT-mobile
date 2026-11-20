import { App, Modal, Notice } from "obsidian";
import { AgentCredential, NativeAgentSpec } from "../types";
import { cosyDeviceLogin, cosyPatLogin, readCosyCred } from "../agents/qwenwork-auth";
import { fetchDynamicModels } from "../agents/models";
import { buildAnthropicAuthUrl, exchangeAnthropicCode } from "../agents/oauth";
import { t } from "../i18n";
import { rec } from "../agents/guards";

export interface LoginDeps {
  credentials: Record<string, AgentCredential>;
  saveCredential: (id: string, cred: AgentCredential) => Promise<void>;
}

/**
 * 应用内登录授权弹窗（双语，移动端）：
 * - cosy 站点：设备流（浏览器授权 + 轮询），Qoder CN 另支持 PAT
 * - claude：手动码 OAuth（浏览器授权 → 复制 code → 粘贴交换令牌）
 * - 其余：应用内填写 API Key 并验证
 */
export class LoginModal extends Modal {
  private settled = false;
  private statusEl!: HTMLElement;
  private logEl!: HTMLElement;
  private retryBtn!: HTMLButtonElement;

  constructor(
    app: App,
    private spec: NativeAgentSpec,
    private onSuccess: () => void,
    private deps: LoginDeps
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ah-login-modal");
    contentEl.createEl("h3", { text: t("loginTitle", { agent: this.spec.label }) });
    this.statusEl = contentEl.createEl("p", { cls: "ah-login-status", text: "…" });
    this.logEl = contentEl.createEl("pre", { cls: "ah-login-log" });

    if (this.spec.protocol === "cosy") {
      this.buildDeviceFlow(contentEl);
    } else {
      this.buildCredForm(contentEl);
    }

    const btns = contentEl.createDiv({ cls: "ah-confirm-buttons" });
    this.retryBtn = btns.createEl("button", { text: t("retry") });
    this.retryBtn.hide();
    this.retryBtn.addEventListener("click", () => {
      if (this.spec.protocol === "cosy") void this.beginDevice();
    });
    const cancel = btns.createEl("button", { text: t("cancel") });
    cancel.addEventListener("click", () => this.close());
  }

  private log(line: string) {
    this.logEl.appendText(line + "\n");
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // ---- cosy 设备流 ----
  private buildDeviceFlow(contentEl: HTMLElement) {
    const spec = this.spec;
    contentEl.createEl("p", { cls: "ah-confirm-hint", text: t("deviceHint", { agent: spec.label }) });
    const start = contentEl.createEl("button", { text: t("openBrowser"), cls: "mod-cta" });
    start.addEventListener("click", () => { void this.beginDevice(); });
    if (spec.cred === "device+pat") {
      const box = contentEl.createDiv({ cls: "ah-login-pat" });
      box.createEl("p", { cls: "ah-confirm-hint", text: t("patHint") });
      const row = box.createDiv({ cls: "ah-login-pat-row" });
      const input = row.createEl("input", { type: "password", placeholder: "pt-…" });
      const save = row.createEl("button", { text: t("verifySave") });
      save.addEventListener("click", () => {
        void (async () => {
          const pat = input.value.trim();
          if (!pat) return new Notice(t("pastePatFirst"));
          save.setText(t("verifying"));
          try {
            await cosyPatLogin(spec.site!, pat);
            this.succeed();
          } catch (e) {
            this.statusEl.setText(String(rec(e).message ?? e));
            save.setText(t("verifySave"));
          }
        })();
      });
    }
    void this.beginDevice();
  }

  private async beginDevice() {
    const spec = this.spec;
    this.settled = false;
    this.retryBtn.hide();
    this.statusEl.setText(t("openingLogin"));
    try {
      await cosyDeviceLogin(
        spec.site!,
        (url) => {
          this.log(url);
          window.open(url, "_blank");
          this.statusEl.setText(t("browserOpened"));
        },
        () => this.settled
      );
      if (!this.settled) this.succeed();
    } catch (e) {
      if (this.settled) return;
      this.statusEl.setText(String(rec(e).message ?? e));
      this.retryBtn.show();
    }
  }

  // ---- key / oauth 凭据表单 ----
  private buildCredForm(contentEl: HTMLElement) {
    const spec = this.spec;
    const cur = this.deps.credentials[spec.id] ?? {};
    contentEl.createEl("p", { cls: "ah-confirm-hint", text: t(`agent.${spec.id}.hint`) || t("credHintDefault") });

    if (spec.mobileAuth === "manual-code" && spec.oauth === "anthropic") {
      this.buildManualCodeFlow(contentEl, cur);
    }
    if (spec.id === "doubao") {
      const box = contentEl.createDiv({ cls: "ah-login-pat" });
      box.createEl("p", { cls: "ah-confirm-hint", text: t("consoleHint") });
      const ob = box.createEl("button", { text: t("openConsole") });
      ob.addEventListener("click", () => window.open("https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey", "_blank"));
    }

    const form = contentEl.createDiv({ cls: "ah-login-pat" });
    let baseInput: HTMLInputElement | null = null;
    if (spec.protocol === "openai-compat") {
      const r = form.createDiv({ cls: "ah-login-pat-row" });
      r.createSpan({ text: t("baseUrl") });
      baseInput = r.createEl("input", { type: "text", placeholder: spec.baseUrl ?? "https://…/v1" });
      baseInput.value = cur.baseUrl ?? spec.baseUrl ?? "";
    }
    const r1 = form.createDiv({ cls: "ah-login-pat-row" });
    r1.createSpan({ text: t("apiKey") });
    const keyInput = r1.createEl("input", { type: "password", placeholder: "sk-…" });
    keyInput.value = cur.apiKey ?? "";
    const save = form.createEl("button", { text: t("verifySave"), cls: "mod-cta" });
    save.addEventListener("click", () => {
      void (async () => {
        const cred: AgentCredential = {
          ...cur,
          apiKey: keyInput.value.trim(),
          ...(baseInput ? { baseUrl: baseInput.value.trim() } : {}),
        };
        if (!cred.apiKey && !cred.oauthToken) return new Notice(t("fillKeyOrOauth"));
        save.setText(t("verifying"));
        await this.deps.saveCredential(spec.id, cred);
        await this.verify(spec, cred);
        save.setText(t("verifySave"));
      })();
    });
    this.statusEl.setText(t("credHintDefault"));
  }

  // ---- Anthropic 手动码 OAuth（移动端无本地回调服务器） ----
  private buildManualCodeFlow(contentEl: HTMLElement, cur: AgentCredential) {
    const spec = this.spec;
    const box = contentEl.createDiv({ cls: "ah-login-pat" });
    box.createEl("p", { cls: "ah-confirm-hint", text: t("manualCodeHint") });
    let pending: { verifier: string; state: string } | null = null;
    const openBtn = box.createEl("button", { text: t("openAuthPage"), cls: "mod-cta" });
    const codeInput = box.createEl("textarea", {
      cls: "ah-login-code",
      attr: { placeholder: t("codePlaceholder"), rows: "2" },
    });
    const submit = box.createEl("button", { text: t("submitCode") });
    openBtn.addEventListener("click", () => {
      void (async () => {
        openBtn.disabled = true;
        this.statusEl.setText(t("openingLogin"));
        try {
          const a = await buildAnthropicAuthUrl();
          pending = { verifier: a.verifier, state: a.state };
          this.log(a.url);
          window.open(a.url, "_blank");
          this.statusEl.setText(t("manualCodeWaiting"));
        } catch (e) {
          this.statusEl.setText(String(rec(e).message ?? e));
        } finally {
          openBtn.disabled = false;
        }
      })();
    });
    submit.addEventListener("click", () => {
      void (async () => {
        const code = codeInput.value.trim();
        if (!code) return new Notice(t("pasteCodeFirst"));
        if (!pending) return new Notice(t("openAuthFirst"));
        submit.disabled = true;
        this.statusEl.setText(t("exchangingCode"));
        try {
          const tokens = await exchangeAnthropicCode(code, pending.verifier, pending.state);
          if (this.settled) return;
          await this.deps.saveCredential(spec.id, {
            ...cur,
            oauthToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
          });
          this.succeed();
        } catch (e) {
          if (this.settled) return;
          this.statusEl.setText(String(rec(e).message ?? e));
          submit.disabled = false;
        }
      })();
    });
  }

  private async verify(spec: NativeAgentSpec, cred: AgentCredential) {
    const cosy = spec.protocol === "cosy" ? readCosyCred(spec.site!) : null;
    const models = await fetchDynamicModels(spec, cred, cosy);
    if (models.length || spec.protocol === "openai-compat") {
      this.succeed();
    } else {
      this.statusEl.setText(t("verifyFail"));
    }
  }

  private succeed() {
    if (this.settled) return;
    this.settled = true;
    new Notice(t("loginSuccess", { agent: this.spec.label }));
    this.onSuccess();
    this.close();
  }

  onClose() {
    this.settled = true;
    this.contentEl.empty();
  }
}