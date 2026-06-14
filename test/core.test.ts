import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCitekey,
  stampNote,
  insertCitation,
  checkIntegrity,
  parseCitations,
  type Registry,
} from "../src/core.ts";

function makeRegistry(): { reg: Registry; citekey: string; blockIds: string[] } {
  const meta = { author: "Geertz, Clifford", year: "1973", title: "The Interpretation of Cultures" };
  const citekey = generateCitekey(meta);
  const body = "Culture is a web of significance.\n\nThick description is the method.";
  const { blocks } = stampNote(body);
  const reg: Registry = { [citekey]: { meta: { ...meta, citekey }, blocks } };
  return { reg, citekey, blockIds: Object.keys(blocks) };
}

test("citekey is stable and content-derived", () => {
  const k = generateCitekey({ author: "Geertz, Clifford", year: "1973", title: "The Interpretation of Cultures" });
  assert.equal(k, "geertz-1973-the-interpretation-of-cultures");
});

test("stampNote handles CRLF line endings (Windows files)", () => {
  const crlf = "First passage.\r\n\r\nSecond passage.";
  const { content, blocks } = stampNote(crlf);
  assert.equal(Object.keys(blocks).length, 2);
  assert.match(content, /First passage\. \^blk-/);
  assert.match(content, /Second passage\. \^blk-/);
});

test("stampNote is idempotent", () => {
  const first = stampNote("One para.\n\nTwo para.");
  const second = stampNote(first.content);
  assert.equal(first.content, second.content);
  assert.deepEqual(Object.keys(first.blocks).sort(), Object.keys(second.blocks).sort());
});

test("G1: insertCitation rejects a citekey not in the registry", () => {
  const { reg, blockIds } = makeRegistry();
  assert.throws(
    () => insertCitation(reg, { citekey: "fake-9999-nonsense", blockId: blockIds[0], locator: "p.1" }),
    /unknown source/,
  );
});

test("G1: insertCitation rejects a block not in the source", () => {
  const { reg, citekey } = makeRegistry();
  assert.throws(
    () => insertCitation(reg, { citekey, blockId: "blk-doesnotexist", locator: "p.1" }),
    /unknown block/,
  );
});

test("G1: integrity flags a hand-typed fake citation", () => {
  const { reg } = makeRegistry();
  const note = "Per the source [[totally-made-up#^blk-zzzzzz|p.4]] this is invented.";
  const issues = checkIntegrity(note, reg);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "unresolved-source");
});

test("G2: a valid citation round-trips and resolves clean", () => {
  const { reg, citekey, blockIds } = makeRegistry();
  const quote = reg[citekey].blocks[blockIds[0]];
  const cite = insertCitation(reg, { citekey, blockId: blockIds[0], locator: "p.5", quote });
  const note = `Argument. ${cite}`;
  assert.equal(checkIntegrity(note, reg).length, 0);
  assert.equal(parseCitations(note)[0].citekey, citekey);
});

test("G2: renaming the source note (filename) does not break resolution", () => {
  const { reg, citekey, blockIds } = makeRegistry();
  const cite = insertCitation(reg, { citekey, blockId: blockIds[0], locator: "p.5" });
  const note = `See ${cite}`;
  assert.equal(checkIntegrity(note, reg).length, 0);
});

test("G2: editing the source block flags drift", () => {
  const { reg, citekey, blockIds } = makeRegistry();
  const id = blockIds[0];
  const quote = reg[citekey].blocks[id];
  const note = `Claim. ${insertCitation(reg, { citekey, blockId: id, locator: "p.5", quote })}`;
  reg[citekey].blocks[id] = "Culture is a web of SIGNIFICANCE, revised.";
  const issues = checkIntegrity(note, reg);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "drift");
});
