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
    this.addCommand({
      id: "stamp-source",
      name: "Stamp source (assign citekey + block ids)",
      editorCallback: async (_editor, ctx) => {
        const file = ctx.file;
        if (!file) return;
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
    });
    this.addCommand({
      id: "cite",
      name: "Cite a passage",
      editorCallback: async (editor) => {
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
    });
    this.addCommand({
      id: "integrity-check",
      name: "Integrity check (this note)",
      editorCallback: async (_editor, ctx) => {
        const file = ctx.file;
        if (!file) return;
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
    });
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2NvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBGdXp6eVN1Z2dlc3RNb2RhbCxcbiAgTWFya2Rvd25GaWxlSW5mbyxcbiAgTW9kYWwsXG4gIE5vdGljZSxcbiAgUGx1Z2luLFxuICBTZXR0aW5nLFxuICBwYXJzZVlhbWwsXG4gIHN0cmluZ2lmeVlhbWwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVDaXRla2V5LFxuICBzdGFtcE5vdGUsXG4gIGluc2VydENpdGF0aW9uLFxuICBjaGVja0ludGVncml0eSxcbiAgdHlwZSBSZWdpc3RyeSxcbn0gZnJvbSBcIi4vY29yZVwiO1xuXG5jb25zdCBGTV9SRSA9IC9eLS0tXFxuKFtcXHNcXFNdKj8pXFxuLS0tXFxuPy87XG5cbmZ1bmN0aW9uIHNwbGl0RnJvbnRtYXR0ZXIodGV4dDogc3RyaW5nKTogeyBmbTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47IGJvZHk6IHN0cmluZyB9IHtcbiAgdGV4dCA9IHRleHQucmVwbGFjZSgvXlx1RkVGRi8sIFwiXCIpLnJlcGxhY2UoL1xcclxcbi9nLCBcIlxcblwiKTtcbiAgY29uc3QgbSA9IHRleHQubWF0Y2goRk1fUkUpO1xuICBpZiAoIW0pIHJldHVybiB7IGZtOiB7fSwgYm9keTogdGV4dCB9O1xuICByZXR1cm4geyBmbTogKHBhcnNlWWFtbChtWzFdKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPz8ge30sIGJvZHk6IHRleHQuc2xpY2UobVswXS5sZW5ndGgpIH07XG59XG5cbmZ1bmN0aW9uIGpvaW5Gcm9udG1hdHRlcihmbTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGJvZHk6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgLS0tXFxuJHtzdHJpbmdpZnlZYW1sKGZtKX0tLS1cXG4ke2JvZHl9YDtcbn1cblxuLyoqIEJ1aWxkIHRoZSBjbG9zZWQtY29ycHVzIHJlZ2lzdHJ5IGZyb20gZXZlcnkgbm90ZSBjYXJyeWluZyBhIGNpdGVrZXkuICovXG5hc3luYyBmdW5jdGlvbiBidWlsZFJlZ2lzdHJ5KGFwcDogQXBwKTogUHJvbWlzZTxSZWdpc3RyeT4ge1xuICBjb25zdCByZWc6IFJlZ2lzdHJ5ID0ge307XG4gIGZvciAoY29uc3QgZmlsZSBvZiBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgY29uc3QgY2FjaGUgPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk7XG4gICAgY29uc3QgY2l0ZWtleSA9IGNhY2hlPy5mcm9udG1hdHRlcj8uY2l0ZWtleSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgaWYgKCFjaXRla2V5KSBjb250aW51ZTtcbiAgICBjb25zdCB0ZXh0ID0gYXdhaXQgYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG4gICAgY29uc3QgeyBmbSwgYm9keSB9ID0gc3BsaXRGcm9udG1hdHRlcih0ZXh0KTtcbiAgICBjb25zdCB7IGJsb2NrcyB9ID0gc3RhbXBOb3RlKGJvZHkpO1xuICAgIHJlZ1tjaXRla2V5XSA9IHtcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgY2l0ZWtleSxcbiAgICAgICAgdGl0bGU6IFN0cmluZyhmbS50aXRsZSA/PyBmaWxlLmJhc2VuYW1lKSxcbiAgICAgICAgYXV0aG9yOiBTdHJpbmcoZm0uYXV0aG9yID8/IFwiXCIpLFxuICAgICAgICB5ZWFyOiBTdHJpbmcoZm0ueWVhciA/PyBcIlwiKSxcbiAgICAgICAgdXJsOiBmbS51cmwgPyBTdHJpbmcoZm0udXJsKSA6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgICBibG9ja3MsXG4gICAgfTtcbiAgfVxuICByZXR1cm4gcmVnO1xufVxuXG5pbnRlcmZhY2UgQmxvY2tDaG9pY2Uge1xuICBjaXRla2V5OiBzdHJpbmc7XG4gIGJsb2NrSWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xufVxuXG5jbGFzcyBCbG9ja1BpY2tlciBleHRlbmRzIEZ1enp5U3VnZ2VzdE1vZGFsPEJsb2NrQ2hvaWNlPiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIGl0ZW1zOiBCbG9ja0Nob2ljZVtdLCBwcml2YXRlIG9uUGljazogKGM6IEJsb2NrQ2hvaWNlKSA9PiB2b2lkKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnNldFBsYWNlaG9sZGVyKFwiQ2l0ZSBhIHBhc3NhZ2UgZnJvbSB5b3VyIHNvdXJjZXNcdTIwMjZcIik7XG4gIH1cbiAgZ2V0SXRlbXMoKTogQmxvY2tDaG9pY2VbXSB7XG4gICAgcmV0dXJuIHRoaXMuaXRlbXM7XG4gIH1cbiAgZ2V0SXRlbVRleHQoYzogQmxvY2tDaG9pY2UpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHtjLmNpdGVrZXl9IFx1MjAxNCAke2MudGV4dC5zbGljZSgwLCA4MCl9YDtcbiAgfVxuICBvbkNob29zZUl0ZW0oYzogQmxvY2tDaG9pY2UpOiB2b2lkIHtcbiAgICB0aGlzLm9uUGljayhjKTtcbiAgfVxufVxuXG5jbGFzcyBMb2NhdG9yTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgdmFsdWUgPSBcIlwiO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSBvblN1Ym1pdDogKGxvY2F0b3I6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHN1cGVyKGFwcCk7XG4gIH1cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiTG9jYXRvciAocGFnZSAvIHNlY3Rpb24pXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiUGFnZVwiKS5hZGRUZXh0KCh0KSA9PlxuICAgICAgdC5zZXRQbGFjZWhvbGRlcihcInAuIDEyXCIpLm9uQ2hhbmdlKCh2KSA9PiAodGhpcy52YWx1ZSA9IHYpKSxcbiAgICApO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5hZGRCdXR0b24oKGIpID0+XG4gICAgICBiXG4gICAgICAgIC5zZXRCdXR0b25UZXh0KFwiSW5zZXJ0XCIpXG4gICAgICAgIC5zZXRDdGEoKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICAgIHRoaXMub25TdWJtaXQodGhpcy52YWx1ZSB8fCBcIm4ucC5cIik7XG4gICAgICAgIH0pLFxuICAgICk7XG4gIH1cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENpdGVFbmdpbmVQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN0YW1wLXNvdXJjZVwiLFxuICAgICAgbmFtZTogXCJTdGFtcCBzb3VyY2UgKGFzc2lnbiBjaXRla2V5ICsgYmxvY2sgaWRzKVwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IGFzeW5jIChfZWRpdG9yOiBFZGl0b3IsIGN0eDogTWFya2Rvd25GaWxlSW5mbykgPT4ge1xuICAgICAgICBjb25zdCBmaWxlID0gY3R4LmZpbGU7XG4gICAgICAgIGlmICghZmlsZSkgcmV0dXJuO1xuICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgeyBmbSwgYm9keSB9ID0gc3BsaXRGcm9udG1hdHRlcih0ZXh0KTtcbiAgICAgICAgaWYgKCFmbS5jaXRla2V5KSB7XG4gICAgICAgICAgZm0uY2l0ZWtleSA9IGdlbmVyYXRlQ2l0ZWtleSh7XG4gICAgICAgICAgICBhdXRob3I6IFN0cmluZyhmbS5hdXRob3IgPz8gXCJcIiksXG4gICAgICAgICAgICB5ZWFyOiBTdHJpbmcoZm0ueWVhciA/PyBcIlwiKSxcbiAgICAgICAgICAgIHRpdGxlOiBTdHJpbmcoZm0udGl0bGUgPz8gZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgeyBjb250ZW50IH0gPSBzdGFtcE5vdGUoYm9keSk7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBqb2luRnJvbnRtYXR0ZXIoZm0sIGNvbnRlbnQpKTtcbiAgICAgICAgbmV3IE5vdGljZShgU3RhbXBlZCBhcyAke2ZtLmNpdGVrZXl9YCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNpdGVcIixcbiAgICAgIG5hbWU6IFwiQ2l0ZSBhIHBhc3NhZ2VcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiBhc3luYyAoZWRpdG9yOiBFZGl0b3IpID0+IHtcbiAgICAgICAgY29uc3QgcmVnID0gYXdhaXQgYnVpbGRSZWdpc3RyeSh0aGlzLmFwcCk7XG4gICAgICAgIGNvbnN0IGl0ZW1zOiBCbG9ja0Nob2ljZVtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2NpdGVrZXksIGVudHJ5XSBvZiBPYmplY3QuZW50cmllcyhyZWcpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBbYmxvY2tJZCwgdGV4dF0gb2YgT2JqZWN0LmVudHJpZXMoZW50cnkuYmxvY2tzKSkge1xuICAgICAgICAgICAgaXRlbXMucHVzaCh7IGNpdGVrZXksIGJsb2NrSWQsIHRleHQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBuZXcgTm90aWNlKFwiTm8gc3RhbXBlZCBzb3VyY2VzIHlldC4gUnVuIFx1MjAxQ1N0YW1wIHNvdXJjZVx1MjAxRCBvbiBhIGNsaXBwZWQgbm90ZSBmaXJzdC5cIik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG5ldyBCbG9ja1BpY2tlcih0aGlzLmFwcCwgaXRlbXMsIChjaG9pY2UpID0+IHtcbiAgICAgICAgICBuZXcgTG9jYXRvck1vZGFsKHRoaXMuYXBwLCAobG9jYXRvcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2l0ZSA9IGluc2VydENpdGF0aW9uKHJlZywge1xuICAgICAgICAgICAgICBjaXRla2V5OiBjaG9pY2UuY2l0ZWtleSxcbiAgICAgICAgICAgICAgYmxvY2tJZDogY2hvaWNlLmJsb2NrSWQsXG4gICAgICAgICAgICAgIGxvY2F0b3IsXG4gICAgICAgICAgICAgIHF1b3RlOiBjaG9pY2UudGV4dCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24oY2l0ZSk7XG4gICAgICAgICAgfSkub3BlbigpO1xuICAgICAgICB9KS5vcGVuKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImludGVncml0eS1jaGVja1wiLFxuICAgICAgbmFtZTogXCJJbnRlZ3JpdHkgY2hlY2sgKHRoaXMgbm90ZSlcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiBhc3luYyAoX2VkaXRvcjogRWRpdG9yLCBjdHg6IE1hcmtkb3duRmlsZUluZm8pID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IGN0eC5maWxlO1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICAgICAgY29uc3QgcmVnID0gYXdhaXQgYnVpbGRSZWdpc3RyeSh0aGlzLmFwcCk7XG4gICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBjb25zdCBpc3N1ZXMgPSBjaGVja0ludGVncml0eSh0ZXh0LCByZWcpO1xuICAgICAgICBpZiAoaXNzdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIG5ldyBOb3RpY2UoXCJcdTI3MTMgQWxsIGNpdGF0aW9ucyByZXNvbHZlLiBObyBkcmlmdC5cIik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxpbmVzID0gaXNzdWVzLm1hcCgoaSkgPT4ge1xuICAgICAgICAgIGlmIChpLmtpbmQgPT09IFwiZHJpZnRcIikgcmV0dXJuIGBEUklGVCAgJHtpLmNpdGVrZXl9I14ke2kuYmxvY2tJZH1cXG4gIHF1b3RlZDogICR7aS5leHBlY3RlZH1cXG4gIHNvdXJjZTogICR7aS5hY3R1YWx9YDtcbiAgICAgICAgICBpZiAoaS5raW5kID09PSBcInVucmVzb2x2ZWQtYmxvY2tcIikgcmV0dXJuIGBNSVNTSU5HIEJMT0NLICAke2kuY2l0ZWtleX0jXiR7aS5ibG9ja0lkfWA7XG4gICAgICAgICAgcmV0dXJuIGBVTktOT1dOIFNPVVJDRSAgJHtpLmNpdGVrZXl9YDtcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHJlcG9ydCA9IGAjIEludGVncml0eSByZXBvcnQgXHUyMDE0ICR7ZmlsZS5iYXNlbmFtZX1cXG5cXG4ke2xpbmVzLmpvaW4oXCJcXG5cXG5cIil9XFxuYDtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGBJbnRlZ3JpdHkgcmVwb3J0IFx1MjAxNCAke2ZpbGUuYmFzZW5hbWV9Lm1kYCwgcmVwb3J0KTtcbiAgICAgICAgbmV3IE5vdGljZShgJHtpc3N1ZXMubGVuZ3RofSBpc3N1ZShzKS4gU2VlIGludGVncml0eSByZXBvcnQuYCk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59XG4iLCAiLyoqXG4gKiBjaXRlLWVuZ2luZSBjb3JlIFx1MjAxNCBwdXJlIGxvZ2ljLCBubyBPYnNpZGlhbiBpbXBvcnRzLlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgU291cmNlTWV0YSB7XG4gIGNpdGVrZXk6IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgYXV0aG9yOiBzdHJpbmc7XG4gIHllYXI6IHN0cmluZztcbiAgdXJsPzogc3RyaW5nO1xuICBjbGlwcGVkX2F0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNvdXJjZUVudHJ5IHtcbiAgbWV0YTogU291cmNlTWV0YTtcbiAgLyoqIGJsb2NrSWQgLT4gY3VycmVudCBwYXNzYWdlIHRleHQgKi9cbiAgYmxvY2tzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG4vKiogY2l0ZWtleSAtPiBzb3VyY2UgZW50cnkgKi9cbmV4cG9ydCB0eXBlIFJlZ2lzdHJ5ID0gUmVjb3JkPHN0cmluZywgU291cmNlRW50cnk+O1xuXG5leHBvcnQgaW50ZXJmYWNlIENpdGF0aW9uIHtcbiAgY2l0ZWtleTogc3RyaW5nO1xuICBibG9ja0lkOiBzdHJpbmc7XG4gIGxvY2F0b3I6IHN0cmluZztcbiAgcXVvdGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIElzc3VlID1cbiAgfCB7IGtpbmQ6IFwidW5yZXNvbHZlZC1zb3VyY2VcIjsgY2l0ZWtleTogc3RyaW5nOyByYXc6IHN0cmluZyB9XG4gIHwgeyBraW5kOiBcInVucmVzb2x2ZWQtYmxvY2tcIjsgY2l0ZWtleTogc3RyaW5nOyBibG9ja0lkOiBzdHJpbmc7IHJhdzogc3RyaW5nIH1cbiAgfCB7IGtpbmQ6IFwiZHJpZnRcIjsgY2l0ZWtleTogc3RyaW5nOyBibG9ja0lkOiBzdHJpbmc7IGV4cGVjdGVkOiBzdHJpbmc7IGFjdHVhbDogc3RyaW5nOyByYXc6IHN0cmluZyB9O1xuXG5jb25zdCBzbHVnID0gKHM6IHN0cmluZyk6IHN0cmluZyA9PlxuICBzXG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAucmVwbGFjZSgvW15hLXowLTldKy9nLCBcIi1cIilcbiAgICAucmVwbGFjZSgvXi0rfC0rJC9nLCBcIlwiKVxuICAgIC5zcGxpdChcIi1cIilcbiAgICAuc2xpY2UoMCwgNClcbiAgICAuam9pbihcIi1cIik7XG5cbmNvbnN0IHN1cm5hbWUgPSAoYXV0aG9yOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhID0gYXV0aG9yLnRyaW0oKTtcbiAgaWYgKGEuaW5jbHVkZXMoXCIsXCIpKSByZXR1cm4gc2x1ZyhhLnNwbGl0KFwiLFwiKVswXSk7XG4gIGNvbnN0IHBhcnRzID0gYS5zcGxpdCgvXFxzKy8pO1xuICByZXR1cm4gc2x1ZyhwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSB8fCBhKTtcbn07XG5cbi8qKiBTdGFibGUsIGNvbnRlbnQtZGVyaXZlZCBrZXk6IHN1cm5hbWUteWVhci10aXRsZXNsdWcuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaXRla2V5KG1ldGE6IFBpY2s8U291cmNlTWV0YSwgXCJhdXRob3JcIiB8IFwieWVhclwiIHwgXCJ0aXRsZVwiPik6IHN0cmluZyB7XG4gIHJldHVybiBbc3VybmFtZShtZXRhLmF1dGhvciksIG1ldGEueWVhciwgc2x1ZyhtZXRhLnRpdGxlKV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCItXCIpO1xufVxuXG5mdW5jdGlvbiBuZXdCbG9ja0lkKGV4aXN0aW5nOiBTZXQ8c3RyaW5nPik6IHN0cmluZyB7XG4gIGxldCBpZDogc3RyaW5nO1xuICBkbyB7XG4gICAgaWQgPSBcImJsay1cIiArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpO1xuICB9IHdoaWxlIChleGlzdGluZy5oYXMoaWQpKTtcbiAgcmV0dXJuIGlkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YW1wUmVzdWx0IHtcbiAgY29udGVudDogc3RyaW5nO1xuICBibG9ja3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmNvbnN0IEJMT0NLX1JFRl9SRSA9IC9cXHNcXF4oW0EtWmEtejAtOS1dKylcXHMqJC87XG5cbi8qKlxuICogQXNzaWduIGJsb2NrIGlkcyB0byBlYWNoIG5vbi1lbXB0eSBwYXJhZ3JhcGggb2YgYSBzb3VyY2Ugbm90ZSBib2R5LlxuICogSWRlbXBvdGVudDsgQ1JMRi10b2xlcmFudCAoV2luZG93cyBmaWxlcykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGFtcE5vdGUoYm9keTogc3RyaW5nKTogU3RhbXBSZXN1bHQge1xuICBib2R5ID0gYm9keS5yZXBsYWNlKC9cXHJcXG4vZywgXCJcXG5cIik7XG4gIGNvbnN0IHBhcmFzID0gYm9keS5zcGxpdCgvXFxuezIsfS8pO1xuICBjb25zdCBleGlzdGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHAgb2YgcGFyYXMpIHtcbiAgICBjb25zdCBtID0gcC5tYXRjaChCTE9DS19SRUZfUkUpO1xuICAgIGlmIChtKSBleGlzdGluZy5hZGQobVsxXSk7XG4gIH1cbiAgY29uc3QgYmxvY2tzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGNvbnN0IG91dCA9IHBhcmFzLm1hcCgocCkgPT4ge1xuICAgIGNvbnN0IHRyaW1tZWQgPSBwLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIHJldHVybiBwO1xuICAgIGNvbnN0IG0gPSBwLm1hdGNoKEJMT0NLX1JFRl9SRSk7XG4gICAgaWYgKG0pIHtcbiAgICAgIGJsb2Nrc1ttWzFdXSA9IHAucmVwbGFjZShCTE9DS19SRUZfUkUsIFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiBwO1xuICAgIH1cbiAgICBjb25zdCBpZCA9IG5ld0Jsb2NrSWQoZXhpc3RpbmcpO1xuICAgIGV4aXN0aW5nLmFkZChpZCk7XG4gICAgYmxvY2tzW2lkXSA9IHRyaW1tZWQ7XG4gICAgcmV0dXJuIGAke3RyaW1tZWR9IF4ke2lkfWA7XG4gIH0pO1xuICByZXR1cm4geyBjb250ZW50OiBvdXQuam9pbihcIlxcblxcblwiKSwgYmxvY2tzIH07XG59XG5cbi8qKlxuICogUHJvZHVjZSBhIGNpdGF0aW9uIHN0cmluZy4gVEhST1dTIGlmIHRoZSAoY2l0ZWtleSwgYmxvY2tJZCkgaXMgbm90IGFscmVhZHlcbiAqIGluIHRoZSByZWdpc3RyeSBcdTIwMTQgdGhlIHN0cnVjdHVyYWwgbm8tZmFicmljYXRpb24gZ3VhcmFudGVlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0Q2l0YXRpb24ocmVnOiBSZWdpc3RyeSwgYzogQ2l0YXRpb24pOiBzdHJpbmcge1xuICBjb25zdCBlbnRyeSA9IHJlZ1tjLmNpdGVrZXldO1xuICBpZiAoIWVudHJ5KSB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gc291cmNlOiAke2MuY2l0ZWtleX1gKTtcbiAgaWYgKCEoYy5ibG9ja0lkIGluIGVudHJ5LmJsb2NrcykpIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBibG9jayAke2MuYmxvY2tJZH0gaW4gJHtjLmNpdGVrZXl9YCk7XG4gIGNvbnN0IHJlZiA9IGBbWyR7Yy5jaXRla2V5fSNeJHtjLmJsb2NrSWR9fCR7Yy5sb2NhdG9yfV1dYDtcbiAgcmV0dXJuIGMucXVvdGUgPyBgXCIke2MucXVvdGV9XCIgJHtyZWZ9YCA6IHJlZjtcbn1cblxuY29uc3QgQ0lURV9SRSA9IC8oPzpcIihbXlwiXSopXCJcXHMqKT9cXFtcXFsoW14jXFxdfF0rKSNcXF4oW0EtWmEtejAtOS1dKylcXHwoW15cXF1dKilcXF1cXF0vZztcblxuLyoqIEV4dHJhY3QgZXZlcnkgY2l0YXRpb24gb2NjdXJyZW5jZSBmcm9tIGEgY29uc3VtaW5nIG5vdGUuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDaXRhdGlvbnModGV4dDogc3RyaW5nKTogQ2l0YXRpb25bXSB7XG4gIGNvbnN0IG91dDogQ2l0YXRpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IG0gb2YgdGV4dC5tYXRjaEFsbChDSVRFX1JFKSkge1xuICAgIG91dC5wdXNoKHsgcXVvdGU6IG1bMV0sIGNpdGVrZXk6IG1bMl0sIGJsb2NrSWQ6IG1bM10sIGxvY2F0b3I6IG1bNF0gfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBTY2FuIGEgbm90ZSBhZ2FpbnN0IHRoZSByZWdpc3RyeS4gRmxhZ3MgY2l0YXRpb25zIHdob3NlIHNvdXJjZS9ibG9jayBub1xuICogbG9uZ2VyIGV4aXN0cywgYW5kIHF1b3RlcyB0aGF0IG5vIGxvbmdlciBtYXRjaCB0aGVpciByZWZlcmVuY2VkIGJsb2NrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tJbnRlZ3JpdHkodGV4dDogc3RyaW5nLCByZWc6IFJlZ2lzdHJ5KTogSXNzdWVbXSB7XG4gIGNvbnN0IGlzc3VlczogSXNzdWVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IG0gb2YgdGV4dC5tYXRjaEFsbChDSVRFX1JFKSkge1xuICAgIGNvbnN0IHJhdyA9IG1bMF07XG4gICAgY29uc3QgcXVvdGUgPSBtWzFdO1xuICAgIGNvbnN0IGNpdGVrZXkgPSBtWzJdO1xuICAgIGNvbnN0IGJsb2NrSWQgPSBtWzNdO1xuICAgIGNvbnN0IGVudHJ5ID0gcmVnW2NpdGVrZXldO1xuICAgIGlmICghZW50cnkpIHtcbiAgICAgIGlzc3Vlcy5wdXNoKHsga2luZDogXCJ1bnJlc29sdmVkLXNvdXJjZVwiLCBjaXRla2V5LCByYXcgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKCEoYmxvY2tJZCBpbiBlbnRyeS5ibG9ja3MpKSB7XG4gICAgICBpc3N1ZXMucHVzaCh7IGtpbmQ6IFwidW5yZXNvbHZlZC1ibG9ja1wiLCBjaXRla2V5LCBibG9ja0lkLCByYXcgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKHF1b3RlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IGFjdHVhbCA9IGVudHJ5LmJsb2Nrc1tibG9ja0lkXTtcbiAgICAgIGlmIChxdW90ZS50cmltKCkgIT09IGFjdHVhbC50cmltKCkpIHtcbiAgICAgICAgaXNzdWVzLnB1c2goeyBraW5kOiBcImRyaWZ0XCIsIGNpdGVrZXksIGJsb2NrSWQsIGV4cGVjdGVkOiBxdW90ZSwgYWN0dWFsLCByYXcgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBpc3N1ZXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFXTzs7O0FDdUJQLElBQU0sT0FBTyxDQUFDLE1BQ1osRUFDRyxZQUFZLEVBQ1osUUFBUSxlQUFlLEdBQUcsRUFDMUIsUUFBUSxZ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
