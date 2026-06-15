import {
  App,
  Editor,
  FuzzySuggestModal,
  Modal,
  Notice,
  Plugin,
  Setting,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import {
  generateCitekey,
  stampNote,
  insertCitation,
  checkIntegrity,
  type Registry,
} from "./core";

const FM_RE = /^---\n([\s\S]*?)\n---\n?/;

function splitFrontmatter(text: string): { fm: Record<string, unknown>; body: string } {
  text = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = text.match(FM_RE);
  if (!m) return { fm: {}, body: text };
  return { fm: (parseYaml(m[1]) as Record<string, unknown>) ?? {}, body: text.slice(m[0].length) };
}

function joinFrontmatter(fm: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(fm)}---\n${body}`;
}

/** Build the closed-corpus registry from every note carrying a citekey. */
async function buildRegistry(app: App): Promise<Registry> {
  const reg: Registry = {};
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const citekey = cache?.frontmatter?.citekey as string | undefined;
    if (!citekey) continue;
    const text = await app.vault.cachedRead(file);
    const { fm, body } = splitFrontmatter(text);
    const { blocks } = stampNote(body);
    reg[citekey] = {
      meta: {
        citekey,
        title: String(fm.title ?? file.basename),
        author: String(fm.author ?? ""),
        year: String(fm.year ?? ""),
        url: fm.url ? String(fm.url) : undefined,
      },
      blocks,
    };
  }
  return reg;
}

interface BlockChoice {
  citekey: string;
  blockId: string;
  text: string;
}

class BlockPicker extends FuzzySuggestModal<BlockChoice> {
  constructor(app: App, private items: BlockChoice[], private onPick: (c: BlockChoice) => void) {
    super(app);
    this.setPlaceholder("Cite a passage from your sources…");
  }
  getItems(): BlockChoice[] {
    return this.items;
  }
  getItemText(c: BlockChoice): string {
    return `${c.citekey} — ${c.text.slice(0, 80)}`;
  }
  onChooseItem(c: BlockChoice): void {
    this.onPick(c);
  }
}

class LocatorModal extends Modal {
  private value = "";
  constructor(app: App, private onSubmit: (locator: string) => void) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText("Locator (page / section)");
    new Setting(this.contentEl).setName("Page").addText((t) =>
      t.setPlaceholder("p. 12").onChange((v) => (this.value = v)),
    );
    new Setting(this.contentEl).addButton((b) =>
      b
        .setButtonText("Insert")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(this.value || "n.p.");
        }),
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

export default class CiteEnginePlugin extends Plugin {
  async onload(): Promise<void> {
    this.addRibbonIcon("quote-glyph", "Cite Engine: cite a passage", () => this.cite());

    this.addCommand({
      id: "stamp-source",
      name: "Stamp source (assign citekey + block ids)",
      callback: () => this.stampSource(),
    });

    this.addCommand({
      id: "cite",
      name: "Cite a passage",
      callback: () => this.cite(),
    });

    this.addCommand({
      id: "integrity-check",
      name: "Integrity check (this note)",
      callback: () => this.integrityCheck(),
    });
  }

  /** Active markdown editor + its file, or null with a guiding notice. */
  private activeNote(): { editor: Editor; file: TFile } | null {
    const ae = this.app.workspace.activeEditor;
    if (ae?.editor && ae.file) return { editor: ae.editor, file: ae.file };
    new Notice("Open a markdown note first, then run this Cite Engine command.");
    return null;
  }

  private async stampSource(): Promise<void> {
    const ctx = this.activeNote();
    if (!ctx) return;
    const { file } = ctx;
    const text = await this.app.vault.read(file);
    const { fm, body } = splitFrontmatter(text);
    if (!fm.citekey) {
      fm.citekey = generateCitekey({
        author: String(fm.author ?? ""),
        year: String(fm.year ?? ""),
        title: String(fm.title ?? file.basename),
      });
    }
    const { content } = stampNote(body);
    await this.app.vault.modify(file, joinFrontmatter(fm, content));
    new Notice(`Stamped as ${fm.citekey}`);
  }

  private async cite(): Promise<void> {
    const ctx = this.activeNote();
    if (!ctx) return;
    const { editor } = ctx;
    const reg = await buildRegistry(this.app);
    const items: BlockChoice[] = [];
    for (const [citekey, entry] of Object.entries(reg)) {
      for (const [blockId, text] of Object.entries(entry.blocks)) {
        items.push({ citekey, blockId, text });
      }
    }
    if (items.length === 0) {
      new Notice("No stamped sources yet. Run “Stamp source” on a clipped note first.");
      return;
    }
    new BlockPicker(this.app, items, (choice) => {
      new LocatorModal(this.app, (locator) => {
        const cite = insertCitation(reg, {
          citekey: choice.citekey,
          blockId: choice.blockId,
          locator,
          quote: choice.text,
        });
        editor.replaceSelection(cite);
      }).open();
    }).open();
  }

  private async integrityCheck(): Promise<void> {
    const ctx = this.activeNote();
    if (!ctx) return;
    const { file } = ctx;
    const reg = await buildRegistry(this.app);
    const text = await this.app.vault.read(file);
    const issues = checkIntegrity(text, reg);
    if (issues.length === 0) {
      new Notice("✓ All citations resolve. No drift.");
      return;
    }
    const lines = issues.map((i) => {
      if (i.kind === "drift") return `DRIFT  ${i.citekey}#^${i.blockId}\n  quoted:  ${i.expected}\n  source:  ${i.actual}`;
      if (i.kind === "unresolved-block") return `MISSING BLOCK  ${i.citekey}#^${i.blockId}`;
      return `UNKNOWN SOURCE  ${i.citekey}`;
    });
    const report = `# Integrity report — ${file.basename}\n\n${lines.join("\n\n")}\n`;
    const reportPath = `Integrity report — ${file.basename}.md`;
    const existingReport = this.app.vault.getAbstractFileByPath(reportPath);
    if (existingReport instanceof TFile) {
      await this.app.vault.modify(existingReport, report);
    } else {
      await this.app.vault.create(reportPath, report);
    }
    new Notice(`${issues.length} issue(s). See integrity report.`);
  }
}
