# Cite Engine

Drift-proof, closed-corpus citations for Obsidian. You can only cite passages
that exist in your own clipped sources, so **fabrication is impossible by
construction**. A citation resolves to a passage (a native block reference), not
to copied text, so it **won't silently go stale** when you edit or rename the
source.

## Three commands

1. **Stamp source** — run on a clipped note. Adds a stable `citekey` to
   frontmatter (from `author` / `year` / `title`) and a `^block-id` to every
   passage. Idempotent.
2. **Cite a passage** — fuzzy-pick a passage from your stamped sources and
   insert a live block-ref citation `[[citekey#^blk|p. NN]]`. There is no
   free-text path, so you cannot cite something that doesn't exist.
3. **Integrity check** — scan the active note; flags any citation that no longer
   resolves, and any quoted text that has drifted from its source block.

A quote icon in the left ribbon also runs **Cite a passage**.

## Data model

A **source note** carries `citekey` in frontmatter and `^block-id`s on its
passages. A **citation** is a native block ref plus a page locator. It renders
live, so it can't drift. Resolution is by `citekey` (content-derived, stable),
independent of filename, so renames don't break anything.

## Install

**From Community Plugins** (once approved): Settings, Community plugins, Browse,
search "Cite Engine".

**Beta / testing via BRAT:** install the BRAT plugin, run *Add a beta plugin*,
and paste `Flyingmiata-droid/cite-engine`.

**Manual:** copy `main.js`, `manifest.json`, `versions.json` into
`<your-vault>/.obsidian/plugins/cite-engine/`, then enable in Settings,
Community plugins.

## Develop

```
npm install
npm run build      # bundle -> main.js
npm test           # core logic: G1 no-fabrication, G2 drift-proof
npx tsc --noEmit   # typecheck
```

The citation logic lives in `src/core.ts` with no Obsidian imports, so it's unit
tested headless. `src/main.ts` is the thin Obsidian wrapper.
