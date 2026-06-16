"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CiteEnginePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/core.ts
var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").slice(0, 4).join("-");
var surname = (author) => {
  const a = author.trim();
  if (a.includes(",")) return slug(a.split(",")[0]);
  const parts = a.split(/\s+/);
  return slug(parts[parts.length - 1] || a);
};
function generateCitekey(meta) {
  return [surname(meta.author), meta.year, slug(meta.title)].filter(Boolean).join("-");
}
function newBlockId(existing) {
  let id;
  do {
    id = "blk-" + Math.random().toString(36).slice(2, 8);
  } while (existing.has(id));
  return id;
}
var BLOCK_REF_RE = /\s\^([A-Za-z0-9-]+)\s*$/;
function stampNote(body) {
  body = body.replace(/\r\n/g, "\n");
  const paras = body.split(/\n{2,}/);
  const existing = /* @__PURE__ */ new Set();
  for (const p of paras) {
    const m = p.match(BLOCK_REF_RE);
    if (m) existing.add(m[1]);
  }
  const blocks = {};
  const out = paras.map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return p;
    const m = p.match(BLOCK_REF_RE);
    if (m) {
      blocks[m[1]] = p.replace(BLOCK_REF_RE, "").trim();
      return p;
    }
    const id = newBlockId(existing);
    existing.add(id);
    blocks[id] = trimmed;
    return `${trimmed} ^${id}`;
  });
  return { content: out.join("\n\n"), blocks };
}
function insertCitation(reg, c) {
  const entry = reg[c.citekey];
  if (!entry) throw new Error(`unknown source: ${c.citekey}`);
  if (!(c.blockId in entry.blocks)) throw new Error(`unknown block ${c.blockId} in ${c.citekey}`);
  const ref = `[[${c.citekey}#^${c.blockId}|${c.locator}]]`;
  return c.quote ? `"${c.quote}" ${ref}` : ref;
}
var CITE_RE = /(?:"([^"]*)"\s*)?\[\[([^#\]|]+)#\^([A-Za-z0-9-]+)\|([^\]]*)\]\]/g;
function checkIntegrity(text, reg) {
  const issues = [];
  for (const m of text.matchAll(CITE_RE)) {
    const raw = m[0];
    const quote = m[1];
    const citekey = m[2];
    const blockId = m[3];
    const entry = reg[citekey];
    if (!entry) {
      issues.push({ kind: "unresolved-source", citekey, raw });
      continue;
    }
    if (!(blockId in entry.blocks)) {
      issues.push({ kind: "unresolved-block", citekey, blockId, raw });
      continue;
    }
    if (quote !== void 0) {
      const actual = entry.blocks[blockId];
      if (quote.trim() !== actual.trim()) {
        issues.push({ kind: "drift", citekey, blockId, expected: quote, actual, raw });
      }
    }
  }
  return issues;
}

// src/main.ts
var FM_RE = /^---\n([\s\S]*?)\n---\n?/;
function splitFrontmatter(text) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const m = text.match(FM_RE);
  if (!m) return { fm: {}, body: text };
  return { fm: (0, import_obsidian.parseYaml)(m[1]) ?? {}, body: text.slice(m[0].length) };
}
function joinFrontmatter(fm, body) {
  return `---
${(0, import_obsidian.stringifyYaml)(fm)}---
${body}`;
}
async function buildRegistry(app) {
  const reg = {};
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const citekey = cache?.frontmatter?.citekey;
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
        url: fm.url ? String(fm.url) : void 0
      },
      blocks
    };
  }
  return reg;
}
var BlockPicker = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, items, onPick) {
    super(app);
    this.items = items;
    this.onPick = onPick;
    this.setPlaceholder("Cite a passage from your sources\u2026");
  }
  getItems() {
    return this.items;
  }
  getItemText(c) {
    return `${c.citekey} \u2014 ${c.text.slice(0, 80)}`;
  }
  onChooseItem(c) {
    this.onPick(c);
  }
};
var LocatorModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.value = "";
  }
  onOpen() {
    this.titleEl.setText("Locator (page / section)");
    new import_obsidian.Setting(this.contentEl).setName("Page").addText(
      (t) => t.setPlaceholder("p. 12").onChange((v) => this.value = v)
    );
    new import_obsidian.Setting(this.contentEl).addButton(
      (b) => b.setButtonText("Insert").setCta().onClick(() => {
        this.close();
        this.onSubmit(this.value || "n.p.");
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CiteEnginePlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.addRibbonIcon("quote-glyph", "Cite Engine: cite a passage", () => this.cite());
    this.addCommand({
      id: "stamp-source",
      name: "Stamp source (assign citekey + block ids)",
      callback: () => this.stampSource()
    });
    this.addCommand({
      id: "cite",
      name: "Cite a passage",
      callback: () => this.cite()
    });
    this.addCommand({
      id: "integrity-check",
      name: "Integrity check (this note)",
      callback: () => this.integrityCheck()
    });
  }
  /** Active markdown editor + its file, or null with a guiding notice. */
  activeNote() {
    const ae = this.app.workspace.activeEditor;
    if (ae?.editor && ae.file) return { editor: ae.editor, file: ae.file };
    new import_obsidian.Notice("Open a markdown note first, then run this Cite Engine command.");
    return null;
  }
  async stampSource() {
    const ctx = this.activeNote();
    if (!ctx) return;
    const { file } = ctx;
    const text = await this.app.vault.read(file);
    const { fm, body } = splitFrontmatter(text);
    if (!fm.citekey) {
      fm.citekey = generateCitekey({
        author: String(fm.author ?? ""),
        year: String(fm.year ?? ""),
        title: String(fm.title ?? file.basename)
      });
    }
    const { content } = stampNote(body);
    await this.app.vault.modify(file, joinFrontmatter(fm, content));
    new import_obsidian.Notice(`Stamped as ${fm.citekey}`);
  }
  async cite() {
    const ctx = this.activeNote();
    if (!ctx) return;
    const { editor } = ctx;
    const reg = await buildRegistry(this.app);
    const items = [];
    for (const [citekey, entry] of Object.entries(reg)) {
      for (const [blockId, text] of Object.entries(entry.blocks)) {
        items.push({ citekey, blockId, text });
      }
    }
    if (items.length === 0) {
      new import_obsidian.Notice("No stamped sources yet. Run \u201CStamp source\u201D on a clipped note first.");
      return;
    }
    new BlockPicker(this.app, items, (choice) => {
      new LocatorModal(this.app, (locator) => {
        const cite = insertCitation(reg, {
          citekey: choice.citekey,
          blockId: choice.blockId,
          locator,
          quote: choice.text
        });
        editor.replaceSelection(cite);
      }).open();
    }).open();
  }
  async integrityCheck() {
    const ctx = this.activeNote();
    if (!ctx) return;
    const { file } = ctx;
    const reg = await buildRegistry(this.app);
    const text = await this.app.vault.read(file);
    const issues = checkIntegrity(text, reg);
    if (issues.length === 0) {
      new import_obsidian.Notice("\u2713 All citations resolve. No drift.");
      return;
    }
    const lines = issues.map((i) => {
      if (i.kind === "drift") return `DRIFT  ${i.citekey}#^${i.blockId}
  quoted:  ${i.expected}
  source:  ${i.actual}`;
      if (i.kind === "unresolved-block") return `MISSING BLOCK  ${i.citekey}#^${i.blockId}`;
      return `UNKNOWN SOURCE  ${i.citekey}`;
    });
    const report = `# Integrity report \u2014 ${file.basename}

${lines.join("\n\n")}
`;
    const reportPath = `Integrity report \u2014 ${file.basename}.md`;
    const existingReport = this.app.vault.getAbstractFileByPath(reportPath);
    if (existingReport instanceof import_obsidian.TFile) {
      await this.app.vault.modify(existingReport, report);
    } else {
      await this.app.vault.create(reportPath, report);
    }
    new import_obsidian.Notice(`${issues.length} issue(s). See integrity report.`);
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2NvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBGdXp6eVN1Z2dlc3RNb2RhbCxcbiAgTW9kYWwsXG4gIE5vdGljZSxcbiAgUGx1Z2luLFxuICBTZXR0aW5nLFxuICBURmlsZSxcbiAgcGFyc2VZYW1sLFxuICBzdHJpbmdpZnlZYW1sLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7XG4gIGdlbmVyYXRlQ2l0ZWtleSxcbiAgc3RhbXBOb3RlLFxuICBpbnNlcnRDaXRhdGlvbixcbiAgY2hlY2tJbnRlZ3JpdHksXG4gIHR5cGUgUmVnaXN0cnksXG59IGZyb20gXCIuL2NvcmVcIjtcblxuY29uc3QgRk1fUkUgPSAvXi0tLVxcbihbXFxzXFxTXSo/KVxcbi0tLVxcbj8vO1xuXG5mdW5jdGlvbiBzcGxpdEZyb250bWF0dGVyKHRleHQ6IHN0cmluZyk6IHsgZm06IFJlY29yZDxzdHJpbmcsIHVua25vd24+OyBib2R5OiBzdHJpbmcgfSB7XG4gIHRleHQgPSB0ZXh0LnJlcGxhY2UoL15cdUZFRkYvLCBcIlwiKS5yZXBsYWNlKC9cXHJcXG4vZywgXCJcXG5cIik7XG4gIGNvbnN0IG0gPSB0ZXh0Lm1hdGNoKEZNX1JFKTtcbiAgaWYgKCFtKSByZXR1cm4geyBmbToge30sIGJvZHk6IHRleHQgfTtcbiAgcmV0dXJuIHsgZm06IChwYXJzZVlhbWwobVsxXSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID8/IHt9LCBib2R5OiB0ZXh0LnNsaWNlKG1bMF0ubGVuZ3RoKSB9O1xufVxuXG5mdW5jdGlvbiBqb2luRnJvbnRtYXR0ZXIoZm06IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBib2R5OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYC0tLVxcbiR7c3RyaW5naWZ5WWFtbChmbSl9LS0tXFxuJHtib2R5fWA7XG59XG5cbi8qKiBCdWlsZCB0aGUgY2xvc2VkLWNvcnB1cyByZWdpc3RyeSBmcm9tIGV2ZXJ5IG5vdGUgY2FycnlpbmcgYSBjaXRla2V5LiAqL1xuYXN5bmMgZnVuY3Rpb24gYnVpbGRSZWdpc3RyeShhcHA6IEFwcCk6IFByb21pc2U8UmVnaXN0cnk+IHtcbiAgY29uc3QgcmVnOiBSZWdpc3RyeSA9IHt9O1xuICBmb3IgKGNvbnN0IGZpbGUgb2YgYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgIGNvbnN0IGNhY2hlID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpO1xuICAgIGNvbnN0IGNpdGVrZXkgPSBjYWNoZT8uZnJvbnRtYXR0ZXI/LmNpdGVrZXkgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGlmICghY2l0ZWtleSkgY29udGludWU7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IGFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xuICAgIGNvbnN0IHsgZm0sIGJvZHkgfSA9IHNwbGl0RnJvbnRtYXR0ZXIodGV4dCk7XG4gICAgY29uc3QgeyBibG9ja3MgfSA9IHN0YW1wTm90ZShib2R5KTtcbiAgICByZWdbY2l0ZWtleV0gPSB7XG4gICAgICBtZXRhOiB7XG4gICAgICAgIGNpdGVrZXksXG4gICAgICAgIHRpdGxlOiBTdHJpbmcoZm0udGl0bGUgPz8gZmlsZS5iYXNlbmFtZSksXG4gICAgICAgIGF1dGhvcjogU3RyaW5nKGZtLmF1dGhvciA/PyBcIlwiKSxcbiAgICAgICAgeWVhcjogU3RyaW5nKGZtLnllYXIgPz8gXCJcIiksXG4gICAgICAgIHVybDogZm0udXJsID8gU3RyaW5nKGZtLnVybCkgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgICAgYmxvY2tzLFxuICAgIH07XG4gIH1cbiAgcmV0dXJuIHJlZztcbn1cblxuaW50ZXJmYWNlIEJsb2NrQ2hvaWNlIHtcbiAgY2l0ZWtleTogc3RyaW5nO1xuICBibG9ja0lkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbn1cblxuY2xhc3MgQmxvY2tQaWNrZXIgZXh0ZW5kcyBGdXp6eVN1Z2dlc3RNb2RhbDxCbG9ja0Nob2ljZT4ge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSBpdGVtczogQmxvY2tDaG9pY2VbXSwgcHJpdmF0ZSBvblBpY2s6IChjOiBCbG9ja0Nob2ljZSkgPT4gdm9pZCkge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy5zZXRQbGFjZWhvbGRlcihcIkNpdGUgYSBwYXNzYWdlIGZyb20geW91ciBzb3VyY2VzXHUyMDI2XCIpO1xuICB9XG4gIGdldEl0ZW1zKCk6IEJsb2NrQ2hvaWNlW10ge1xuICAgIHJldHVybiB0aGlzLml0ZW1zO1xuICB9XG4gIGdldEl0ZW1UZXh0KGM6IEJsb2NrQ2hvaWNlKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7Yy5jaXRla2V5fSBcdTIwMTQgJHtjLnRleHQuc2xpY2UoMCwgODApfWA7XG4gIH1cbiAgb25DaG9vc2VJdGVtKGM6IEJsb2NrQ2hvaWNlKTogdm9pZCB7XG4gICAgdGhpcy5vblBpY2soYyk7XG4gIH1cbn1cblxuY2xhc3MgTG9jYXRvck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIHZhbHVlID0gXCJcIjtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgb25TdWJtaXQ6IChsb2NhdG9yOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICBzdXBlcihhcHApO1xuICB9XG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIkxvY2F0b3IgKHBhZ2UgLyBzZWN0aW9uKVwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlBhZ2VcIikuYWRkVGV4dCgodCkgPT5cbiAgICAgIHQuc2V0UGxhY2Vob2xkZXIoXCJwLiAxMlwiKS5vbkNoYW5nZSgodikgPT4gKHRoaXMudmFsdWUgPSB2KSksXG4gICAgKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuYWRkQnV0dG9uKChiKSA9PlxuICAgICAgYlxuICAgICAgICAuc2V0QnV0dG9uVGV4dChcIkluc2VydFwiKVxuICAgICAgICAuc2V0Q3RhKClcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgICAgICB0aGlzLm9uU3VibWl0KHRoaXMudmFsdWUgfHwgXCJuLnAuXCIpO1xuICAgICAgICB9KSxcbiAgICApO1xuICB9XG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDaXRlRW5naW5lUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcInF1b3RlLWdseXBoXCIsIFwiQ2l0ZSBFbmdpbmU6IGNpdGUgYSBwYXNzYWdlXCIsICgpID0+IHRoaXMuY2l0ZSgpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzdGFtcC1zb3VyY2VcIixcbiAgICAgIG5hbWU6IFwiU3RhbXAgc291cmNlIChhc3NpZ24gY2l0ZWtleSArIGJsb2NrIGlkcylcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLnN0YW1wU291cmNlKCksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiY2l0ZVwiLFxuICAgICAgbmFtZTogXCJDaXRlIGEgcGFzc2FnZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMuY2l0ZSgpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImludGVncml0eS1jaGVja1wiLFxuICAgICAgbmFtZTogXCJJbnRlZ3JpdHkgY2hlY2sgKHRoaXMgbm90ZSlcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLmludGVncml0eUNoZWNrKCksXG4gICAgfSk7XG4gIH1cblxuICAvKiogQWN0aXZlIG1hcmtkb3duIGVkaXRvciArIGl0cyBmaWxlLCBvciBudWxsIHdpdGggYSBndWlkaW5nIG5vdGljZS4gKi9cbiAgcHJpdmF0ZSBhY3RpdmVOb3RlKCk6IHsgZWRpdG9yOiBFZGl0b3I7IGZpbGU6IFRGaWxlIH0gfCBudWxsIHtcbiAgICBjb25zdCBhZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5hY3RpdmVFZGl0b3I7XG4gICAgaWYgKGFlPy5lZGl0b3IgJiYgYWUuZmlsZSkgcmV0dXJuIHsgZWRpdG9yOiBhZS5lZGl0b3IsIGZpbGU6IGFlLmZpbGUgfTtcbiAgICBuZXcgTm90aWNlKFwiT3BlbiBhIG1hcmtkb3duIG5vdGUgZmlyc3QsIHRoZW4gcnVuIHRoaXMgQ2l0ZSBFbmdpbmUgY29tbWFuZC5cIik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YW1wU291cmNlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGN0eCA9IHRoaXMuYWN0aXZlTm90ZSgpO1xuICAgIGlmICghY3R4KSByZXR1cm47XG4gICAgY29uc3QgeyBmaWxlIH0gPSBjdHg7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgeyBmbSwgYm9keSB9ID0gc3BsaXRGcm9udG1hdHRlcih0ZXh0KTtcbiAgICBpZiAoIWZtLmNpdGVrZXkpIHtcbiAgICAgIGZtLmNpdGVrZXkgPSBnZW5lcmF0ZUNpdGVrZXkoe1xuICAgICAgICBhdXRob3I6IFN0cmluZyhmbS5hdXRob3IgPz8gXCJcIiksXG4gICAgICAgIHllYXI6IFN0cmluZyhmbS55ZWFyID8/IFwiXCIpLFxuICAgICAgICB0aXRsZTogU3RyaW5nKGZtLnRpdGxlID8/IGZpbGUuYmFzZW5hbWUpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHsgY29udGVudCB9ID0gc3RhbXBOb3RlKGJvZHkpO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBqb2luRnJvbnRtYXR0ZXIoZm0sIGNvbnRlbnQpKTtcbiAgICBuZXcgTm90aWNlKGBTdGFtcGVkIGFzICR7Zm0uY2l0ZWtleX1gKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2l0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjdHggPSB0aGlzLmFjdGl2ZU5vdGUoKTtcbiAgICBpZiAoIWN0eCkgcmV0dXJuO1xuICAgIGNvbnN0IHsgZWRpdG9yIH0gPSBjdHg7XG4gICAgY29uc3QgcmVnID0gYXdhaXQgYnVpbGRSZWdpc3RyeSh0aGlzLmFwcCk7XG4gICAgY29uc3QgaXRlbXM6IEJsb2NrQ2hvaWNlW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtjaXRla2V5LCBlbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMocmVnKSkge1xuICAgICAgZm9yIChjb25zdCBbYmxvY2tJZCwgdGV4dF0gb2YgT2JqZWN0LmVudHJpZXMoZW50cnkuYmxvY2tzKSkge1xuICAgICAgICBpdGVtcy5wdXNoKHsgY2l0ZWtleSwgYmxvY2tJZCwgdGV4dCB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgbmV3IE5vdGljZShcIk5vIHN0YW1wZWQgc291cmNlcyB5ZXQuIFJ1biBcdTIwMUNTdGFtcCBzb3VyY2VcdTIwMUQgb24gYSBjbGlwcGVkIG5vdGUgZmlyc3QuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgQmxvY2tQaWNrZXIodGhpcy5hcHAsIGl0ZW1zLCAoY2hvaWNlKSA9PiB7XG4gICAgICBuZXcgTG9jYXRvck1vZGFsKHRoaXMuYXBwLCAobG9jYXRvcikgPT4ge1xuICAgICAgICBjb25zdCBjaXRlID0gaW5zZXJ0Q2l0YXRpb24ocmVnLCB7XG4gICAgICAgICAgY2l0ZWtleTogY2hvaWNlLmNpdGVrZXksXG4gICAgICAgICAgYmxvY2tJZDogY2hvaWNlLmJsb2NrSWQsXG4gICAgICAgICAgbG9jYXRvcixcbiAgICAgICAgICBxdW90ZTogY2hvaWNlLnRleHQsXG4gICAgICAgIH0pO1xuICAgICAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihjaXRlKTtcbiAgICAgIH0pLm9wZW4oKTtcbiAgICB9KS5vcGVuKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGludGVncml0eUNoZWNrKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGN0eCA9IHRoaXMuYWN0aXZlTm90ZSgpO1xuICAgIGlmICghY3R4KSByZXR1cm47XG4gICAgY29uc3QgeyBmaWxlIH0gPSBjdHg7XG4gICAgY29uc3QgcmVnID0gYXdhaXQgYnVpbGRSZWdpc3RyeSh0aGlzLmFwcCk7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgaXNzdWVzID0gY2hlY2tJbnRlZ3JpdHkodGV4dCwgcmVnKTtcbiAgICBpZiAoaXNzdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgbmV3IE5vdGljZShcIlx1MjcxMyBBbGwgY2l0YXRpb25zIHJlc29sdmUuIE5vIGRyaWZ0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbGluZXMgPSBpc3N1ZXMubWFwKChpKSA9PiB7XG4gICAgICBpZiAoaS5raW5kID09PSBcImRyaWZ0XCIpIHJldHVybiBgRFJJRlQgICR7aS5jaXRla2V5fSNeJHtpLmJsb2NrSWR9XFxuICBxdW90ZWQ6ICAke2kuZXhwZWN0ZWR9XFxuICBzb3VyY2U6ICAke2kuYWN0dWFsfWA7XG4gICAgICBpZiAoaS5raW5kID09PSBcInVucmVzb2x2ZWQtYmxvY2tcIikgcmV0dXJuIGBNSVNTSU5HIEJMT0NLICAke2kuY2l0ZWtleX0jXiR7aS5ibG9ja0lkfWA7XG4gICAgICByZXR1cm4gYFVOS05PV04gU09VUkNFICAke2kuY2l0ZWtleX1gO1xuICAgIH0pO1xuICAgIGNvbnN0IHJlcG9ydCA9IGAjIEludGVncml0eSByZXBvcnQgXHUyMDE0ICR7ZmlsZS5iYXNlbmFtZX1cXG5cXG4ke2xpbmVzLmpvaW4oXCJcXG5cXG5cIil9XFxuYDtcbiAgICBjb25zdCByZXBvcnRQYXRoID0gYEludGVncml0eSByZXBvcnQgXHUyMDE0ICR7ZmlsZS5iYXNlbmFtZX0ubWRgO1xuICAgIGNvbnN0IGV4aXN0aW5nUmVwb3J0ID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHJlcG9ydFBhdGgpO1xuICAgIGlmIChleGlzdGluZ1JlcG9ydCBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmdSZXBvcnQsIHJlcG9ydCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShyZXBvcnRQYXRoLCByZXBvcnQpO1xuICAgIH1cbiAgICBuZXcgTm90aWNlKGAke2lzc3Vlcy5sZW5ndGh9IGlzc3VlKHMpLiBTZWUgaW50ZWdyaXR5IHJlcG9ydC5gKTtcbiAgfVxufVxuIiwgIi8qKlxuICogY2l0ZS1lbmdpbmUgY29yZSBcdTIwMTQgcHVyZSBsb2dpYywgbm8gT2JzaWRpYW4gaW1wb3J0cy5cbiAqL1xuXG5leHBvcnQgaW50ZXJmYWNlIFNvdXJjZU1ldGEge1xuICBjaXRla2V5OiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGF1dGhvcjogc3RyaW5nO1xuICB5ZWFyOiBzdHJpbmc7XG4gIHVybD86IHN0cmluZztcbiAgY2xpcHBlZF9hdD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTb3VyY2VFbnRyeSB7XG4gIG1ldGE6IFNvdXJjZU1ldGE7XG4gIC8qKiBibG9ja0lkIC0+IGN1cnJlbnQgcGFzc2FnZSB0ZXh0ICovXG4gIGJsb2NrczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuLyoqIGNpdGVrZXkgLT4gc291cmNlIGVudHJ5ICovXG5leHBvcnQgdHlwZSBSZWdpc3RyeSA9IFJlY29yZDxzdHJpbmcsIFNvdXJjZUVudHJ5PjtcblxuZXhwb3J0IGludGVyZmFjZSBDaXRhdGlvbiB7XG4gIGNpdGVrZXk6IHN0cmluZztcbiAgYmxvY2tJZDogc3RyaW5nO1xuICBsb2NhdG9yOiBzdHJpbmc7XG4gIHF1b3RlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBJc3N1ZSA9XG4gIHwgeyBraW5kOiBcInVucmVzb2x2ZWQtc291cmNlXCI7IGNpdGVrZXk6IHN0cmluZzsgcmF3OiBzdHJpbmcgfVxuICB8IHsga2luZDogXCJ1bnJlc29sdmVkLWJsb2NrXCI7IGNpdGVrZXk6IHN0cmluZzsgYmxvY2tJZDogc3RyaW5nOyByYXc6IHN0cmluZyB9XG4gIHwgeyBraW5kOiBcImRyaWZ0XCI7IGNpdGVrZXk6IHN0cmluZzsgYmxvY2tJZDogc3RyaW5nOyBleHBlY3RlZDogc3RyaW5nOyBhY3R1YWw6IHN0cmluZzsgcmF3OiBzdHJpbmcgfTtcblxuY29uc3Qgc2x1ZyA9IChzOiBzdHJpbmcpOiBzdHJpbmcgPT5cbiAgc1xuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnJlcGxhY2UoL1teYS16MC05XSsvZywgXCItXCIpXG4gICAgLnJlcGxhY2UoL14tK3wtKyQvZywgXCJcIilcbiAgICAuc3BsaXQoXCItXCIpXG4gICAgLnNsaWNlKDAsIDQpXG4gICAgLmpvaW4oXCItXCIpO1xuXG5jb25zdCBzdXJuYW1lID0gKGF1dGhvcjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYSA9IGF1dGhvci50cmltKCk7XG4gIGlmIChhLmluY2x1ZGVzKFwiLFwiKSkgcmV0dXJuIHNsdWcoYS5zcGxpdChcIixcIilbMF0pO1xuICBjb25zdCBwYXJ0cyA9IGEuc3BsaXQoL1xccysvKTtcbiAgcmV0dXJuIHNsdWcocGFydHNbcGFydHMubGVuZ3RoIC0gMV0gfHwgYSk7XG59O1xuXG4vKiogU3RhYmxlLCBjb250ZW50LWRlcml2ZWQga2V5OiBzdXJuYW1lLXllYXItdGl0bGVzbHVnLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2l0ZWtleShtZXRhOiBQaWNrPFNvdXJjZU1ldGEsIFwiYXV0aG9yXCIgfCBcInllYXJcIiB8IFwidGl0bGVcIj4pOiBzdHJpbmcge1xuICByZXR1cm4gW3N1cm5hbWUobWV0YS5hdXRob3IpLCBtZXRhLnllYXIsIHNsdWcobWV0YS50aXRsZSldLmZpbHRlcihCb29sZWFuKS5qb2luKFwiLVwiKTtcbn1cblxuZnVuY3Rpb24gbmV3QmxvY2tJZChleGlzdGluZzogU2V0PHN0cmluZz4pOiBzdHJpbmcge1xuICBsZXQgaWQ6IHN0cmluZztcbiAgZG8ge1xuICAgIGlkID0gXCJibGstXCIgKyBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KTtcbiAgfSB3aGlsZSAoZXhpc3RpbmcuaGFzKGlkKSk7XG4gIHJldHVybiBpZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdGFtcFJlc3VsdCB7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgYmxvY2tzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5jb25zdCBCTE9DS19SRUZfUkUgPSAvXFxzXFxeKFtBLVphLXowLTktXSspXFxzKiQvO1xuXG4vKipcbiAqIEFzc2lnbiBibG9jayBpZHMgdG8gZWFjaCBub24tZW1wdHkgcGFyYWdyYXBoIG9mIGEgc291cmNlIG5vdGUgYm9keS5cbiAqIElkZW1wb3RlbnQ7IENSTEYtdG9sZXJhbnQgKFdpbmRvd3MgZmlsZXMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhbXBOb3RlKGJvZHk6IHN0cmluZyk6IFN0YW1wUmVzdWx0IHtcbiAgYm9keSA9IGJvZHkucmVwbGFjZSgvXFxyXFxuL2csIFwiXFxuXCIpO1xuICBjb25zdCBwYXJhcyA9IGJvZHkuc3BsaXQoL1xcbnsyLH0vKTtcbiAgY29uc3QgZXhpc3RpbmcgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBwIG9mIHBhcmFzKSB7XG4gICAgY29uc3QgbSA9IHAubWF0Y2goQkxPQ0tfUkVGX1JFKTtcbiAgICBpZiAobSkgZXhpc3RpbmcuYWRkKG1bMV0pO1xuICB9XG4gIGNvbnN0IGJsb2NrczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBjb25zdCBvdXQgPSBwYXJhcy5tYXAoKHApID0+IHtcbiAgICBjb25zdCB0cmltbWVkID0gcC50cmltKCk7XG4gICAgaWYgKCF0cmltbWVkKSByZXR1cm4gcDtcbiAgICBjb25zdCBtID0gcC5tYXRjaChCTE9DS19SRUZfUkUpO1xuICAgIGlmIChtKSB7XG4gICAgICBibG9ja3NbbVsxXV0gPSBwLnJlcGxhY2UoQkxPQ0tfUkVGX1JFLCBcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gcDtcbiAgICB9XG4gICAgY29uc3QgaWQgPSBuZXdCbG9ja0lkKGV4aXN0aW5nKTtcbiAgICBleGlzdGluZy5hZGQoaWQpO1xuICAgIGJsb2Nrc1tpZF0gPSB0cmltbWVkO1xuICAgIHJldHVybiBgJHt0cmltbWVkfSBeJHtpZH1gO1xuICB9KTtcbiAgcmV0dXJuIHsgY29udGVudDogb3V0LmpvaW4oXCJcXG5cXG5cIiksIGJsb2NrcyB9O1xufVxuXG4vKipcbiAqIFByb2R1Y2UgYSBjaXRhdGlvbiBzdHJpbmcuIFRIUk9XUyBpZiB0aGUgKGNpdGVrZXksIGJsb2NrSWQpIGlzIG5vdCBhbHJlYWR5XG4gKiBpbiB0aGUgcmVnaXN0cnkgXHUyMDE0IHRoZSBzdHJ1Y3R1cmFsIG5vLWZhYnJpY2F0aW9uIGd1YXJhbnRlZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc2VydENpdGF0aW9uKHJlZzogUmVnaXN0cnksIGM6IENpdGF0aW9uKTogc3RyaW5nIHtcbiAgY29uc3QgZW50cnkgPSByZWdbYy5jaXRla2V5XTtcbiAgaWYgKCFlbnRyeSkgdGhyb3cgbmV3IEVycm9yKGB1bmtub3duIHNvdXJjZTogJHtjLmNpdGVrZXl9YCk7XG4gIGlmICghKGMuYmxvY2tJZCBpbiBlbnRyeS5ibG9ja3MpKSB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gYmxvY2sgJHtjLmJsb2NrSWR9IGluICR7Yy5jaXRla2V5fWApO1xuICBjb25zdCByZWYgPSBgW1ske2MuY2l0ZWtleX0jXiR7Yy5ibG9ja0lkfXwke2MubG9jYXRvcn1dXWA7XG4gIHJldHVybiBjLnF1b3RlID8gYFwiJHtjLnF1b3RlfVwiICR7cmVmfWAgOiByZWY7XG59XG5cbmNvbnN0IENJVEVfUkUgPSAvKD86XCIoW15cIl0qKVwiXFxzKik/XFxbXFxbKFteI1xcXXxdKykjXFxeKFtBLVphLXowLTktXSspXFx8KFteXFxdXSopXFxdXFxdL2c7XG5cbi8qKiBFeHRyYWN0IGV2ZXJ5IGNpdGF0aW9uIG9jY3VycmVuY2UgZnJvbSBhIGNvbnN1bWluZyBub3RlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2l0YXRpb25zKHRleHQ6IHN0cmluZyk6IENpdGF0aW9uW10ge1xuICBjb25zdCBvdXQ6IENpdGF0aW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIHRleHQubWF0Y2hBbGwoQ0lURV9SRSkpIHtcbiAgICBvdXQucHVzaCh7IHF1b3RlOiBtWzFdLCBjaXRla2V5OiBtWzJdLCBibG9ja0lkOiBtWzNdLCBsb2NhdG9yOiBtWzRdIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKlxuICogU2NhbiBhIG5vdGUgYWdhaW5zdCB0aGUgcmVnaXN0cnkuIEZsYWdzIGNpdGF0aW9ucyB3aG9zZSBzb3VyY2UvYmxvY2sgbm9cbiAqIGxvbmdlciBleGlzdHMsIGFuZCBxdW90ZXMgdGhhdCBubyBsb25nZXIgbWF0Y2ggdGhlaXIgcmVmZXJlbmNlZCBibG9jay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrSW50ZWdyaXR5KHRleHQ6IHN0cmluZywgcmVnOiBSZWdpc3RyeSk6IElzc3VlW10ge1xuICBjb25zdCBpc3N1ZXM6IElzc3VlW10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIHRleHQubWF0Y2hBbGwoQ0lURV9SRSkpIHtcbiAgICBjb25zdCByYXcgPSBtWzBdO1xuICAgIGNvbnN0IHF1b3RlID0gbVsxXTtcbiAgICBjb25zdCBjaXRla2V5ID0gbVsyXTtcbiAgICBjb25zdCBibG9ja0lkID0gbVszXTtcbiAgICBjb25zdCBlbnRyeSA9IHJlZ1tjaXRla2V5XTtcbiAgICBpZiAoIWVudHJ5KSB7XG4gICAgICBpc3N1ZXMucHVzaCh7IGtpbmQ6IFwidW5yZXNvbHZlZC1zb3VyY2VcIiwgY2l0ZWtleSwgcmF3IH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmICghKGJsb2NrSWQgaW4gZW50cnkuYmxvY2tzKSkge1xuICAgICAgaXNzdWVzLnB1c2goeyBraW5kOiBcInVucmVzb2x2ZWQtYmxvY2tcIiwgY2l0ZWtleSwgYmxvY2tJZCwgcmF3IH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChxdW90ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zdCBhY3R1YWwgPSBlbnRyeS5ibG9ja3NbYmxvY2tJZF07XG4gICAgICBpZiAocXVvdGUudHJpbSgpICE9PSBhY3R1YWwudHJpbSgpKSB7XG4gICAgICAgIGlzc3Vlcy5wdXNoKHsga2luZDogXCJkcmlmdFwiLCBjaXRla2V5LCBibG9ja0lkLCBleHBlY3RlZDogcXVvdGUsIGFjdHVhbCwgcmF3IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gaXNzdWVzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsc0JBV087OztBQ3VCUCxJQUFNLE9BQU8sQ0FBQyxNQUNaLEVBQ0csWUFBWSxFQUNaLFFBQVEsZUFBZSxHQUFHLEVBQzFCLFFBQVEsWUFBWSxFQUFFLEVBQ3RCLE1BQU0sR0FBRyxFQUNULE1BQU0sR0FBRyxDQUFDLEVBQ1YsS0FBSyxHQUFHO0FBRWIsSUFBTSxVQUFVLENBQUMsV0FBMkI7QUFDMUMsUUFBTSxJQUFJLE9BQU8sS0FBSztBQUN0QixNQUFJLEVBQUUsU0FBUyxHQUFHLEVBQUcsUUFBTyxLQUFLLEVBQUUsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ2hELFFBQU0sUUFB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
