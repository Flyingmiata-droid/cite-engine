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
  text = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
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
    await this.app.vault.create(`Integrity report \u2014 ${file.basename}.md`, report);
    new import_obsidian.Notice(`${issues.length} issue(s). See integrity report.`);
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2NvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBGdXp6eVN1Z2dlc3RNb2RhbCxcbiAgTW9kYWwsXG4gIE5vdGljZSxcbiAgUGx1Z2luLFxuICBTZXR0aW5nLFxuICBURmlsZSxcbiAgcGFyc2VZYW1sLFxuICBzdHJpbmdpZnlZYW1sLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7XG4gIGdlbmVyYXRlQ2l0ZWtleSxcbiAgc3RhbXBOb3RlLFxuICBpbnNlcnRDaXRhdGlvbixcbiAgY2hlY2tJbnRlZ3JpdHksXG4gIHR5cGUgUmVnaXN0cnksXG59IGZyb20gXCIuL2NvcmVcIjtcblxuY29uc3QgRk1fUkUgPSAvXi0tLVxcbihbXFxzXFxTXSo/KVxcbi0tLVxcbj8vO1xuXG5mdW5jdGlvbiBzcGxpdEZyb250bWF0dGVyKHRleHQ6IHN0cmluZyk6IHsgZm06IFJlY29yZDxzdHJpbmcsIHVua25vd24+OyBib2R5OiBzdHJpbmcgfSB7XG4gIHRleHQgPSB0ZXh0LnJlcGxhY2UoL15cdUZFRkYvLCBcIlwiKS5yZXBsYWNlKC9cXHJcXG4vZywgXCJcXG5cIik7XG4gIGNvbnN0IG0gPSB0ZXh0Lm1hdGNoKEZNX1JFKTtcbiAgaWYgKCFtKSByZXR1cm4geyBmbToge30sIGJvZHk6IHRleHQgfTtcbiAgcmV0dXJuIHsgZm06IChwYXJzZVlhbWwobVsxXSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID8/IHt9LCBib2R5OiB0ZXh0LnNsaWNlKG1bMF0ubGVuZ3RoKSB9O1xufVxuXG5mdW5jdGlvbiBqb2luRnJvbnRtYXR0ZXIoZm06IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBib2R5OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYC0tLVxcbiR7c3RyaW5naWZ5WWFtbChmbSl9LS0tXFxuJHtib2R5fWA7XG59XG5cbi8qKiBCdWlsZCB0aGUgY2xvc2VkLWNvcnB1cyByZWdpc3RyeSBmcm9tIGV2ZXJ5IG5vdGUgY2FycnlpbmcgYSBjaXRla2V5LiAqL1xuYXN5bmMgZnVuY3Rpb24gYnVpbGRSZWdpc3RyeShhcHA6IEFwcCk6IFByb21pc2U8UmVnaXN0cnk+IHtcbiAgY29uc3QgcmVnOiBSZWdpc3RyeSA9IHt9O1xuICBmb3IgKGNvbnN0IGZpbGUgb2YgYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgIGNvbnN0IGNhY2hlID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpO1xuICAgIGNvbnN0IGNpdGVrZXkgPSBjYWNoZT8uZnJvbnRtYXR0ZXI/LmNpdGVrZXkgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGlmICghY2l0ZWtleSkgY29udGludWU7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IGFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xuICAgIGNvbnN0IHsgZm0sIGJvZHkgfSA9IHNwbGl0RnJvbnRtYXR0ZXIodGV4dCk7XG4gICAgY29uc3QgeyBibG9ja3MgfSA9IHN0YW1wTm90ZShib2R5KTtcbiAgICByZWdbY2l0ZWtleV0gPSB7XG4gICAgICBtZXRhOiB7XG4gICAgICAgIGNpdGVrZXksXG4gICAgICAgIHRpdGxlOiBTdHJpbmcoZm0udGl0bGUgPz8gZmlsZS5iYXNlbmFtZSksXG4gICAgICAgIGF1dGhvcjogU3RyaW5nKGZtLmF1dGhvciA/PyBcIlwiKSxcbiAgICAgICAgeWVhcjogU3RyaW5nKGZtLnllYXIgPz8gXCJcIiksXG4gICAgICAgIHVybDogZm0udXJsID8gU3RyaW5nKGZtLnVybCkgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgICAgYmxvY2tzLFxuICAgIH07XG4gIH1cbiAgcmV0dXJuIHJlZztcbn1cblxuaW50ZXJmYWNlIEJsb2NrQ2hvaWNlIHtcbiAgY2l0ZWtleTogc3RyaW5nO1xuICBibG9ja0lkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbn1cblxuY2xhc3MgQmxvY2tQaWNrZXIgZXh0ZW5kcyBGdXp6eVN1Z2dlc3RNb2RhbDxCbG9ja0Nob2ljZT4ge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSBpdGVtczogQmxvY2tDaG9pY2VbXSwgcHJpdmF0ZSBvblBpY2s6IChjOiBCbG9ja0Nob2ljZSkgPT4gdm9pZCkge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy5zZXRQbGFjZWhvbGRlcihcIkNpdGUgYSBwYXNzYWdlIGZyb20geW91ciBzb3VyY2VzXHUyMDI2XCIpO1xuICB9XG4gIGdldEl0ZW1zKCk6IEJsb2NrQ2hvaWNlW10ge1xuICAgIHJldHVybiB0aGlzLml0ZW1zO1xuICB9XG4gIGdldEl0ZW1UZXh0KGM6IEJsb2NrQ2hvaWNlKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7Yy5jaXRla2V5fSBcdTIwMTQgJHtjLnRleHQuc2xpY2UoMCwgODApfWA7XG4gIH1cbiAgb25DaG9vc2VJdGVtKGM6IEJsb2NrQ2hvaWNlKTogdm9pZCB7XG4gICAgdGhpcy5vblBpY2soYyk7XG4gIH1cbn1cblxuY2xhc3MgTG9jYXRvck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIHZhbHVlID0gXCJcIjtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgb25TdWJtaXQ6IChsb2NhdG9yOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICBzdXBlcihhcHApO1xuICB9XG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIkxvY2F0b3IgKHBhZ2UgLyBzZWN0aW9uKVwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlBhZ2VcIikuYWRkVGV4dCgodCkgPT5cbiAgICAgIHQuc2V0UGxhY2Vob2xkZXIoXCJwLiAxMlwiKS5vbkNoYW5nZSgodikgPT4gKHRoaXMudmFsdWUgPSB2KSksXG4gICAgKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuYWRkQnV0dG9uKChiKSA9PlxuICAgICAgYlxuICAgICAgICAuc2V0QnV0dG9uVGV4dChcIkluc2VydFwiKVxuICAgICAgICAuc2V0Q3RhKClcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgICAgICB0aGlzLm9uU3VibWl0KHRoaXMudmFsdWUgfHwgXCJuLnAuXCIpO1xuICAgICAgICB9KSxcbiAgICApO1xuICB9XG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDaXRlRW5naW5lUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcInF1b3RlLWdseXBoXCIsIFwiQ2l0ZSBFbmdpbmU6IGNpdGUgYSBwYXNzYWdlXCIsICgpID0+IHRoaXMuY2l0ZSgpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzdGFtcC1zb3VyY2VcIixcbiAgICAgIG5hbWU6IFwiU3RhbXAgc291cmNlIChhc3NpZ24gY2l0ZWtleSArIGJsb2NrIGlkcylcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLnN0YW1wU291cmNlKCksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiY2l0ZVwiLFxuICAgICAgbmFtZTogXCJDaXRlIGEgcGFzc2FnZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMuY2l0ZSgpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImludGVncml0eS1jaGVja1wiLFxuICAgICAgbmFtZTogXCJJbnRlZ3JpdHkgY2hlY2sgKHRoaXMgbm90ZSlcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLmludGVncml0eUNoZWNrKCksXG4gICAgfSk7XG4gIH1cblxuICAvKiogQWN0aXZlIG1hcmtkb3duIGVkaXRvciArIGl0cyBmaWxlLCBvciBudWxsIHdpdGggYSBndWlkaW5nIG5vdGljZS4gKi9cbiAgcHJpdmF0ZSBhY3RpdmVOb3RlKCk6IHsgZWRpdG9yOiBFZGl0b3I7IGZpbGU6IFRGaWxlIH0gfCBudWxsIHtcbiAgICBjb25zdCBhZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5hY3RpdmVFZGl0b3I7XG4gICAgaWYgKGFlPy5lZGl0b3IgJiYgYWUuZmlsZSkgcmV0dXJuIHsgZWRpdG9yOiBhZS5lZGl0b3IsIGZpbGU6IGFlLmZpbGUgfTtcbiAgICBuZXcgTm90aWNlKFwiT3BlbiBhIG1hcmtkb3duIG5vdGUgZmlyc3QsIHRoZW4gcnVuIHRoaXMgQ2l0ZSBFbmdpbmUgY29tbWFuZC5cIik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YW1wU291cmNlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGN0eCA9IHRoaXMuYWN0aXZlTm90ZSgpO1xuICAgIGlmICghY3R4KSByZXR1cm47XG4gICAgY29uc3QgeyBmaWxlIH0gPSBjdHg7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgeyBmbSwgYm9keSB9ID0gc3BsaXRGcm9udG1hdHRlcih0ZXh0KTtcbiAgICBpZiAoIWZtLmNpdGVrZXkpIHtcbiAgICAgIGZtLmNpdGVrZXkgPSBnZW5lcmF0ZUNpdGVrZXkoe1xuICAgICAgICBhdXRob3I6IFN0cmluZyhmbS5hdXRob3IgPz8gXCJcIiksXG4gICAgICAgIHllYXI6IFN0cmluZyhmbS55ZWFyID8/IFwiXCIpLFxuICAgICAgICB0aXRsZTogU3RyaW5nKGZtLnRpdGxlID8/IGZpbGUuYmFzZW5hbWUpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHsgY29udGVudCB9ID0gc3RhbXBOb3RlKGJvZHkpO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBqb2luRnJvbnRtYXR0ZXIoZm0sIGNvbnRlbnQpKTtcbiAgICBuZXcgTm90aWNlKGBTdGFtcGVkIGFzICR7Zm0uY2l0ZWtleX1gKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2l0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjdHggPSB0aGlzLmFjdGl2ZU5vdGUoKTtcbiAgICBpZiAoIWN0eCkgcmV0dXJuO1xuICAgIGNvbnN0IHsgZWRpdG9yIH0gPSBjdHg7XG4gICAgY29uc3QgcmVnID0gYXdhaXQgYnVpbGRSZWdpc3RyeSh0aGlzLmFwcCk7XG4gICAgY29uc3QgaXRlbXM6IEJsb2NrQ2hvaWNlW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtjaXRla2V5LCBlbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMocmVnKSkge1xuICAgICAgZm9yIChjb25zdCBbYmxvY2tJZCwgdGV4dF0gb2YgT2JqZWN0LmVudHJpZXMoZW50cnkuYmxvY2tzKSkge1xuICAgICAgICBpdGVtcy5wdXNoKHsgY2l0ZWtleSwgYmxvY2tJZCwgdGV4dCB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgbmV3IE5vdGljZShcIk5vIHN0YW1wZWQgc291cmNlcyB5ZXQuIFJ1biBcdTIwMUNTdGFtcCBzb3VyY2VcdTIwMUQgb24gYSBjbGlwcGVkIG5vdGUgZmlyc3QuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgQmxvY2tQaWNrZXIodGhpcy5hcHAsIGl0ZW1zLCAoY2hvaWNlKSA9PiB7XG4gICAgICBuZXcgTG9jYXRvck1vZGFsKHRoaXMuYXBwLCAobG9jYXRvcikgPT4ge1xuICAgICAgICBjb25zdCBjaXRlID0gaW5zZXJ0Q2l0YXRpb24ocmVnLCB7XG4gICAgICAgICAgY2l0ZWtleTogY2hvaWNlLmNpdGVrZXksXG4gICAgICAgICAgYmxvY2tJZDogY2hvaWNlLmJsb2NrSWQsXG4gICAgICAgICAgbG9jYXRvcixcbiAgICAgICAgICBxdW90ZTogY2hvaWNlLnRleHQsXG4gICAgICAgIH0pO1xuICAgICAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihjaXRlKTtcbiAgICAgIH0pLm9wZW4oKTtcbiAgICB9KS5vcGVuKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGludGVncml0eUNoZWNrKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGN0eCA9IHRoaXMuYWN0aXZlTm90ZSgpO1xuICAgIGlmICghY3R4KSByZXR1cm47XG4gICAgY29uc3QgeyBmaWxlIH0gPSBjdHg7XG4gICAgY29uc3QgcmVnID0gYXdhaXQgYnVpbGRSZWdpc3RyeSh0aGlzLmFwcCk7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgaXNzdWVzID0gY2hlY2tJbnRlZ3JpdHkodGV4dCwgcmVnKTtcbiAgICBpZiAoaXNzdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgbmV3IE5vdGljZShcIlx1MjcxMyBBbGwgY2l0YXRpb25zIHJlc29sdmUuIE5vIGRyaWZ0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbGluZXMgPSBpc3N1ZXMubWFwKChpKSA9PiB7XG4gICAgICBpZiAoaS5raW5kID09PSBcImRyaWZ0XCIpIHJldHVybiBgRFJJRlQgICR7aS5jaXRla2V5fSNeJHtpLmJsb2NrSWR9XFxuICBxdW90ZWQ6ICAke2kuZXhwZWN0ZWR9XFxuICBzb3VyY2U6ICAke2kuYWN0dWFsfWA7XG4gICAgICBpZiAoaS5raW5kID09PSBcInVucmVzb2x2ZWQtYmxvY2tcIikgcmV0dXJuIGBNSVNTSU5HIEJMT0NLICAke2kuY2l0ZWtleX0jXiR7aS5ibG9ja0lkfWA7XG4gICAgICByZXR1cm4gYFVOS05PV04gU09VUkNFICAke2kuY2l0ZWtleX1gO1xuICAgIH0pO1xuICAgIGNvbnN0IHJlcG9ydCA9IGAjIEludGVncml0eSByZXBvcnQgXHUyMDE0ICR7ZmlsZS5iYXNlbmFtZX1cXG5cXG4ke2xpbmVzLmpvaW4oXCJcXG5cXG5cIil9XFxuYDtcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoYEludGVncml0eSByZXBvcnQgXHUyMDE0ICR7ZmlsZS5iYXNlbmFtZX0ubWRgLCByZXBvcnQpO1xuICAgIG5ldyBOb3RpY2UoYCR7aXNzdWVzLmxlbmd0aH0gaXNzdWUocykuIFNlZSBpbnRlZ3JpdHkgcmVwb3J0LmApO1xuICB9XG59XG4iLCAiLyoqXG4gKiBjaXRlLWVuZ2luZSBjb3JlIFx1MjAxNCBwdXJlIGxvZ2ljLCBubyBPYnNpZGlhbiBpbXBvcnRzLlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgU291cmNlTWV0YSB7XG4gIGNpdGVrZXk6IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgYXV0aG9yOiBzdHJpbmc7XG4gIHllYXI6IHN0cmluZztcbiAgdXJsPzogc3RyaW5nO1xuICBjbGlwcGVkX2F0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNvdXJjZUVudHJ5IHtcbiAgbWV0YTogU291cmNlTWV0YTtcbiAgLyoqIGJsb2NrSWQgLT4gY3VycmVudCBwYXNzYWdlIHRleHQgKi9cbiAgYmxvY2tzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG4vKiogY2l0ZWtleSAtPiBzb3VyY2UgZW50cnkgKi9cbmV4cG9ydCB0eXBlIFJlZ2lzdHJ5ID0gUmVjb3JkPHN0cmluZywgU291cmNlRW50cnk+O1xuXG5leHBvcnQgaW50ZXJmYWNlIENpdGF0aW9uIHtcbiAgY2l0ZWtleTogc3RyaW5nO1xuICBibG9ja0lkOiBzdHJpbmc7XG4gIGxvY2F0b3I6IHN0cmluZztcbiAgcXVvdGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIElzc3VlID1cbiAgfCB7IGtpbmQ6IFwidW5yZXNvbHZlZC1zb3VyY2VcIjsgY2l0ZWtleTogc3RyaW5nOyByYXc6IHN0cmluZyB9XG4gIHwgeyBraW5kOiBcInVucmVzb2x2ZWQtYmxvY2tcIjsgY2l0ZWtleTogc3RyaW5nOyBibG9ja0lkOiBzdHJpbmc7IHJhdzogc3RyaW5nIH1cbiAgfCB7IGtpbmQ6IFwiZHJpZnRcIjsgY2l0ZWtleTogc3RyaW5nOyBibG9ja0lkOiBzdHJpbmc7IGV4cGVjdGVkOiBzdHJpbmc7IGFjdHVhbDogc3RyaW5nOyByYXc6IHN0cmluZyB9O1xuXG5jb25zdCBzbHVnID0gKHM6IHN0cmluZyk6IHN0cmluZyA9PlxuICBzXG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAucmVwbGFjZSgvW15hLXowLTldKy9nLCBcIi1cIilcbiAgICAucmVwbGFjZSgvXi0rfC0rJC9nLCBcIlwiKVxuICAgIC5zcGxpdChcIi1cIilcbiAgICAuc2xpY2UoMCwgNClcbiAgICAuam9pbihcIi1cIik7XG5cbmNvbnN0IHN1cm5hbWUgPSAoYXV0aG9yOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhID0gYXV0aG9yLnRyaW0oKTtcbiAgaWYgKGEuaW5jbHVkZXMoXCIsXCIpKSByZXR1cm4gc2x1ZyhhLnNwbGl0KFwiLFwiKVswXSk7XG4gIGNvbnN0IHBhcnRzID0gYS5zcGxpdCgvXFxzKy8pO1xuICByZXR1cm4gc2x1ZyhwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSB8fCBhKTtcbn07XG5cbi8qKiBTdGFibGUsIGNvbnRlbnQtZGVyaXZlZCBrZXk6IHN1cm5hbWUteWVhci10aXRsZXNsdWcuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaXRla2V5KG1ldGE6IFBpY2s8U291cmNlTWV0YSwgXCJhdXRob3JcIiB8IFwieWVhclwiIHwgXCJ0aXRsZVwiPik6IHN0cmluZyB7XG4gIHJldHVybiBbc3VybmFtZShtZXRhLmF1dGhvciksIG1ldGEueWVhciwgc2x1ZyhtZXRhLnRpdGxlKV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCItXCIpO1xufVxuXG5mdW5jdGlvbiBuZXdCbG9ja0lkKGV4aXN0aW5nOiBTZXQ8c3RyaW5nPik6IHN0cmluZyB7XG4gIGxldCBpZDogc3RyaW5nO1xuICBkbyB7XG4gICAgaWQgPSBcImJsay1cIiArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpO1xuICB9IHdoaWxlIChleGlzdGluZy5oYXMoaWQpKTtcbiAgcmV0dXJuIGlkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YW1wUmVzdWx0IHtcbiAgY29udGVudDogc3RyaW5nO1xuICBibG9ja3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmNvbnN0IEJMT0NLX1JFRl9SRSA9IC9cXHNcXF4oW0EtWmEtejAtOS1dKylcXHMqJC87XG5cbi8qKlxuICogQXNzaWduIGJsb2NrIGlkcyB0byBlYWNoIG5vbi1lbXB0eSBwYXJhZ3JhcGggb2YgYSBzb3VyY2Ugbm90ZSBib2R5LlxuICogSWRlbXBvdGVudDsgQ1JMRi10b2xlcmFudCAoV2luZG93cyBmaWxlcykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGFtcE5vdGUoYm9keTogc3RyaW5nKTogU3RhbXBSZXN1bHQge1xuICBib2R5ID0gYm9keS5yZXBsYWNlKC9cXHJcXG4vZywgXCJcXG5cIik7XG4gIGNvbnN0IHBhcmFzID0gYm9keS5zcGxpdCgvXFxuezIsfS8pO1xuICBjb25zdCBleGlzdGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHAgb2YgcGFyYXMpIHtcbiAgICBjb25zdCBtID0gcC5tYXRjaChCTE9DS19SRUZfUkUpO1xuICAgIGlmIChtKSBleGlzdGluZy5hZGQobVsxXSk7XG4gIH1cbiAgY29uc3QgYmxvY2tzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGNvbnN0IG91dCA9IHBhcmFzLm1hcCgocCkgPT4ge1xuICAgIGNvbnN0IHRyaW1tZWQgPSBwLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIHJldHVybiBwO1xuICAgIGNvbnN0IG0gPSBwLm1hdGNoKEJMT0NLX1JFRl9SRSk7XG4gICAgaWYgKG0pIHtcbiAgICAgIGJsb2Nrc1ttWzFdXSA9IHAucmVwbGFjZShCTE9DS19SRUZfUkUsIFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiBwO1xuICAgIH1cbiAgICBjb25zdCBpZCA9IG5ld0Jsb2NrSWQoZXhpc3RpbmcpO1xuICAgIGV4aXN0aW5nLmFkZChpZCk7XG4gICAgYmxvY2tzW2lkXSA9IHRyaW1tZWQ7XG4gICAgcmV0dXJuIGAke3RyaW1tZWR9IF4ke2lkfWA7XG4gIH0pO1xuICByZXR1cm4geyBjb250ZW50OiBvdXQuam9pbihcIlxcblxcblwiKSwgYmxvY2tzIH07XG59XG5cbi8qKlxuICogUHJvZHVjZSBhIGNpdGF0aW9uIHN0cmluZy4gVEhST1dTIGlmIHRoZSAoY2l0ZWtleSwgYmxvY2tJZCkgaXMgbm90IGFscmVhZHlcbiAqIGluIHRoZSByZWdpc3RyeSBcdTIwMTQgdGhlIHN0cnVjdHVyYWwgbm8tZmFicmljYXRpb24gZ3VhcmFudGVlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0Q2l0YXRpb24ocmVnOiBSZWdpc3RyeSwgYzogQ2l0YXRpb24pOiBzdHJpbmcge1xuICBjb25zdCBlbnRyeSA9IHJlZ1tjLmNpdGVrZXldO1xuICBpZiAoIWVudHJ5KSB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gc291cmNlOiAke2MuY2l0ZWtleX1gKTtcbiAgaWYgKCEoYy5ibG9ja0lkIGluIGVudHJ5LmJsb2NrcykpIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBibG9jayAke2MuYmxvY2tJZH0gaW4gJHtjLmNpdGVrZXl9YCk7XG4gIGNvbnN0IHJlZiA9IGBbWyR7Yy5jaXRla2V5fSNeJHtjLmJsb2NrSWR9fCR7Yy5sb2NhdG9yfV1dYDtcbiAgcmV0dXJuIGMucXVvdGUgPyBgXCIke2MucXVvdGV9XCIgJHtyZWZ9YCA6IHJlZjtcbn1cblxuY29uc3QgQ0lURV9SRSA9IC8oPzpcIihbXlwiXSopXCJcXHMqKT9cXFtcXFsoW14jXFxdfF0rKSNcXF4oW0EtWmEtejAtOS1dKylcXHwoW15cXF1dKilcXF1cXF0vZztcblxuLyoqIEV4dHJhY3QgZXZlcnkgY2l0YXRpb24gb2NjdXJyZW5jZSBmcm9tIGEgY29uc3VtaW5nIG5vdGUuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDaXRhdGlvbnModGV4dDogc3RyaW5nKTogQ2l0YXRpb25bXSB7XG4gIGNvbnN0IG91dDogQ2l0YXRpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IG0gb2YgdGV4dC5tYXRjaEFsbChDSVRFX1JFKSkge1xuICAgIG91dC5wdXNoKHsgcXVvdGU6IG1bMV0sIGNpdGVrZXk6IG1bMl0sIGJsb2NrSWQ6IG1bM10sIGxvY2F0b3I6IG1bNF0gfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBTY2FuIGEgbm90ZSBhZ2FpbnN0IHRoZSByZWdpc3RyeS4gRmxhZ3MgY2l0YXRpb25zIHdob3NlIHNvdXJjZS9ibG9jayBub1xuICogbG9uZ2VyIGV4aXN0cywgYW5kIHF1b3RlcyB0aGF0IG5vIGxvbmdlciBtYXRjaCB0aGVpciByZWZlcmVuY2VkIGJsb2NrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tJbnRlZ3JpdHkodGV4dDogc3RyaW5nLCByZWc6IFJlZ2lzdHJ5KTogSXNzdWVbXSB7XG4gIGNvbnN0IGlzc3VlczogSXNzdWVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IG0gb2YgdGV4dC5tYXRjaEFsbChDSVRFX1JFKSkge1xuICAgIGNvbnN0IHJhdyA9IG1bMF07XG4gICAgY29uc3QgcXVvdGUgPSBtWzFdO1xuICAgIGNvbnN0IGNpdGVrZXkgPSBtWzJdO1xuICAgIGNvbnN0IGJsb2NrSWQgPSBtWzNdO1xuICAgIGNvbnN0IGVudHJ5ID0gcmVnW2NpdGVrZXldO1xuICAgIGlmICghZW50cnkpIHtcbiAgICAgIGlzc3Vlcy5wdXNoKHsga2luZDogXCJ1bnJlc29sdmVkLXNvdXJjZVwiLCBjaXRla2V5LCByYXcgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKCEoYmxvY2tJZCBpbiBlbnRyeS5ibG9ja3MpKSB7XG4gICAgICBpc3N1ZXMucHVzaCh7IGtpbmQ6IFwidW5yZXNvbHZlZC1ibG9ja1wiLCBjaXRla2V5LCBibG9ja0lkLCByYXcgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKHF1b3RlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IGFjdHVhbCA9IGVudHJ5LmJsb2Nrc1tibG9ja0lkXTtcbiAgICAgIGlmIChxdW90ZS50cmltKCkgIT09IGFjdHVhbC50cmltKCkpIHtcbiAgICAgICAgaXNzdWVzLnB1c2goeyBraW5kOiBcImRyaWZ0XCIsIGNpdGVrZXksIGJsb2NrSWQsIGV4cGVjdGVkOiBxdW90ZSwgYWN0dWFsLCByYXcgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBpc3N1ZXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFXTzs7O0FDdUJQLElBQU0sT0FBTyxDQUFDLE1BQ1osRUFDRyxZQUFZLEVBQ1osUUFBUSxlQUFlLEdBQUcsRUFDMUIsUUFBUSxZQUFZLEVBQUUsRUFDdEIsTUFBTSxHQUFHLEVBQ1QsTUFBTSxHQUFHLENBQUMsRUFDVixLQUFLLEdBQUc7QUFFYixJQUFNLFVBQVUsQ0FBQyxXQUEyQjtBQUMxQyxRQUFNLElBQUksT0FBTyxLQUFLO0FBQ3RCLE1BQUksRUFBRSxTQUFTLEdBQUcsRUFBRyxRQUFPLEtBQUssRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDaEQsUUFBTSxRQUFRLEVBQUUsTUFBTSxLQUFLO0FBQzNCLFNBQU8sS0FBSyxNQUFNLE1BQU0sU0FBUyxDQUFDLEtBQUssQ0FBQztBQUMxQztBQUdPLFNBQVMsZ0JBQWdCLE1BQTZEO0FBQzNGLFNBQU8sQ0FBQyxRQUFRLEtBQUssTUFBTSxHQUFHLEtBQUssTUFBTSxLQUFLLEtBQUssS0FBSyxDQUFDLEVBQUUsT0FBTyxPQUFPLEVBQUUsS0FBSyxHQUFHO0FBQ3JGO0FBRUEsU0FBUyxXQUFXLFVBQStCO0FBQ2pELE1BQUk7QUFDSixLQUFHO0FBQ0Qs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
