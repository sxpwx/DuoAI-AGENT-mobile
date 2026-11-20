import { App, Notice, PluginSettingTab, SettingDefinitionGroup, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import { AGENTS } from "./agents/registry";
import { cosyPatLogin } from "./agents/qwenwork-auth";
import { NativeAgentSpec } from "./types";
import { LoginModal } from "./ui/login-modal";
import { rec } from "./agents/guards";
import { setLangOverride, t2 } from "./i18n";
import type AgentHubPlugin from "./main";

/** 声明式设置（Obsidian 1.13+ 设置搜索可见） */
export class AgentHubSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AgentHubPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const items: SettingDefinitionItem[] = [
      {
        name: t2("language"),
        desc: t2("languageDesc", undefined, "\n"),
        control: { type: "dropdown", key: "language", options: { auto: t2("langAuto"), zh: t2("langZh"), en: t2("langEn") } },
      },
      {
        name: t2("permMode"),
        desc: t2("permModeDesc", undefined, "\n"),
        control: { type: "dropdown", key: "permissionMode", options: { confirm: t2("permConfirmOpt"), full: t2("permFullOpt") } },
      },
      {
        name: t2("networkTools"),
        desc: t2("networkToolsDesc", undefined, "\n"),
        control: { type: "toggle", key: "networkTools" },
      },
      {
        name: t2("confirmTimeout"),
        desc: t2("confirmTimeoutDesc", undefined, "\n"),
        control: { type: "number", key: "confirmTimeoutSec", defaultValue: 180 },
      },
    ];

    for (const spec of AGENTS) {
      const group: SettingDefinitionGroup = { type: "group", heading: spec.label };
      const rows: SettingGroupItem[] = [];
      rows.push({
        name: t2("loginCredSetup"),
        desc: t2(`agent.${spec.id}.hint`, undefined, "\n"),
        action: () => {
          this.openLogin(spec);
        },
      });
      const n = spec;
      if (n.protocol === "openai-compat") {
        rows.push({
          name: t2("baseUrl"),
          control: { type: "text", key: `credentials.${spec.id}.baseUrl`, defaultValue: n.baseUrl ?? "" },
        });
      }
      if (n.cred === "key" || n.cred === "key+oauth") {
        rows.push({ name: t2("apiKey"), control: { type: "secret", key: `credentials.${spec.id}.apiKey` } });
      }
      if (n.cred === "device+pat") {
        rows.push({
          name: t2("patOptional"),
          desc: t2("patDesc", undefined, "\n"),
          control: { type: "secret", key: `credentials.${spec.id}.pat` },
        });
      }
      group.items = rows;
      items.push(group);
    }

    items.push({
      type: "group",
      heading: t2("securityTitle"),
      items: [{ name: t2("securityTitle"), desc: t2("securityDesc", undefined, "\n") }],
    });
    return items;
  }

  private openLogin(spec: NativeAgentSpec) {
    new LoginModal(this.app, spec, () => this.update(), {
      credentials: this.plugin.settings.credentials,
      saveCredential: async (id, cred) => {
        this.plugin.settings.credentials[id] = cred;
        await this.plugin.saveSettings();
      },
    }).open();
  }

  getControlValue(key: string): unknown {
    let cur: unknown = this.plugin.settings;
    for (const part of key.split(".")) cur = rec(cur)[part];
    return cur;
  }

  setControlValue(key: string, value: unknown): void {
    const parts = key.split(".");
    let cur: Record<string, unknown> = this.plugin.settings as unknown as Record<string, unknown>;
    for (const part of parts.slice(0, -1)) {
      const next = rec(cur[part]);
      cur[part] = next;
      cur = next;
    }
    cur[parts[parts.length - 1]] = value;
    if (key === "language") setLangOverride(value as "auto" | "zh" | "en");
    if (key.endsWith(".pat") && typeof value === "string" && value) {
      const id = parts[1];
      const spec = AGENTS.find((a) => a.id === id);
      if (spec?.kind === "native" && spec.site) {
        void cosyPatLogin(spec.site, value)
          .then(() => new Notice(t2("patOk")))
          .catch((e: unknown) => new Notice(String(e instanceof Error ? e.message : e)));
      }
    }
    void this.plugin.saveSettings();
  }
}