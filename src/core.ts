/**
 * cite-engine core — pure logic, no Obsidian imports.
 */

export interface SourceMeta {
  citekey: string;
  title: string;
  author: string;
  year: string;
  url?: string;
  clipped_at?: string;
}

export interface SourceEntry {
  meta: SourceMeta;
  /** blockId -> current passage text */
  blocks: Record<string, string>;
}

/** citekey -> source entry */
export type Registry = Record<string, SourceEntry>;

export interface Citation {
  citekey: string;
  blockId: string;
  locator: string;
  quote?: string;
}

export type Issue =
  | { kind: "unresolved-source"; citekey: string; raw: string }
  | { kind: "unresolved-block"; citekey: string; blockId: string; raw: string }
  | { kind: "drift"; citekey: string; blockId: string; expected: string; actual: string; raw: string };

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 4)
    .join("-");

const surname = (author: string): string => {
  const a = author.trim();
  if (a.includes(",")) return slug(a.split(",")[0]);
  const parts = a.split(/\s+/);
  return slug(parts[parts.length - 1] || a);
};

/** Stable, content-derived key: surname-year-titleslug. */
export function generateCitekey(meta: Pick<SourceMeta, "author" | "year" | "title">): string {
  return [surname(meta.author), meta.year, slug(meta.title)].filter(Boolean).join("-");
}

function newBlockId(existing: Set<string>): string {
  let id: string;
  do {
    id = "blk-" + Math.random().toString(36).slice(2, 8);
  } while (existing.has(id));
  return id;
}

export interface StampResult {
  content: string;
  blocks: Record<string, string>;
}

const BLOCK_REF_RE = /\s\^([A-Za-z0-9-]+)\s*$/;

/**
 * Assign block ids to each non-empty paragraph of a source note body.
 * Idempotent; CRLF-tolerant (Windows files).
 */
export function stampNote(body: string): StampResult {
  body = body.replace(/\r\n/g, "\n");
  const paras = body.split(/\n{2,}/);
  const existing = new Set<string>();
  for (const p of paras) {
    const m = p.match(BLOCK_REF_RE);
    if (m) existing.add(m[1]);
  }
  const blocks: Record<string, string> = {};
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

/**
 * Produce a citation string. THROWS if the (citekey, blockId) is not already
 * in the registry — the structural no-fabrication guarantee.
 */
export function insertCitation(reg: Registry, c: Citation): string {
  const entry = reg[c.citekey];
  if (!entry) throw new Error(`unknown source: ${c.citekey}`);
  if (!(c.blockId in entry.blocks)) throw new Error(`unknown block ${c.blockId} in ${c.citekey}`);
  const ref = `[[${c.citekey}#^${c.blockId}|${c.locator}]]`;
  return c.quote ? `"${c.quote}" ${ref}` : ref;
}

const CITE_RE = /(?:"([^"]*)"\s*)?\[\[([^#\]|]+)#\^([A-Za-z0-9-]+)\|([^\]]*)\]\]/g;

/** Extract every citation occurrence from a consuming note. */
export function parseCitations(text: string): Citation[] {
  const out: Citation[] = [];
  for (const m of text.matchAll(CITE_RE)) {
    out.push({ quote: m[1], citekey: m[2], blockId: m[3], locator: m[4] });
  }
  return out;
}

/**
 * Scan a note against the registry. Flags citations whose source/block no
 * longer exists, and quotes that no longer match their referenced block.
 */
export function checkIntegrity(text: string, reg: Registry): Issue[] {
  const issues: Issue[] = [];
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
    if (quote !== undefined) {
      const actual = entry.blocks[blockId];
      if (quote.trim() !== actual.trim()) {
        issues.push({ kind: "drift", citekey, blockId, expected: quote, actual, raw });
      }
    }
  }
  return issues;
}
