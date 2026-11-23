---
name: math-typeset-chat
description: Trigger on any reply with formulas: render each equation as a tight PNG strip beside its code block; long derivations get a book A4 page.
---

# Typeset math for chat replies

Use whenever an answer contains formulas and the chat surface would print LaTeX source.
WebChat/Control UI render no message math (`$...$`, `\[...\]` show verbatim; KaTeX ships
only inside the mermaid chunk), so formulas must arrive as images.

## 1. Keep message text math-free

Write prose with Unicode symbols (ρ, ∂, ∇, u, ∮, ∫, V₀) instead of `$...$`.
Put each display formula in a fenced `text` code block — that stays copyable, and the
typeset image sits directly under it.

## 2. Write the equation list

```bash
mkdir -p ~/tmp/texrender && cd ~/tmp/texrender
```

Put one `$$ ... $$` block per formula, in reply order, in a `.md` file. Other lines are
ignored by the strip renderer. Every opening `$$` needs a closing `$$` (same line or later),
otherwise the parser swallows the following text as part of the equation.

## 3. Render strips

```bash
node ~/.openclaw/workspace/coordinator/tools/eqstrip.mjs eqs.md --outdir strips --prefix eq
# -> strips/eq-01.png ... ; prints {n, file, tex}
```

Defaults: 24px math, 2x device scale, white background, 10px autocrop margin. Add
`--size 28` when a formula is dense (triple integrals, matrices). Requires KaTeX at
`/home/john/tmp/texrender/node_modules/katex`; if missing, run `npm install katex@0.16.9`
there (npm registry is reachable directly, CDN hosts are not).

## 4. Verify before sending

Open the produced PNGs with the image viewer and reject any strip that
has `SZ=` debug text, red KaTeX error text, a clipped fraction or integral limit.
Heavy-looking italic math is the intended `KaTeX_Math` face, not a font failure.

## 5. Stage, then attach next to the code block

```bash
D=~/.openclaw/workspace/coordinator/deliverables
cp strips/eq-01.png "$D/strip-<topic>-01.png"   # ASCII names; this dir is the only served root
```

In the reply, put the `MEDIA:/home/john/.openclaw/workspace/coordinator/deliverables/strip-<topic>-NN.png`
line on its own line immediately after that formula's code block, keeping the same order
as the messages in the answer.

## 6. Whole-page mode for a derivation chain

When the answer is a multi-step derivation rather than scattered formulas, typeset an A4
book page instead (Computer Modern math, serif CJK body, right-aligned numbers):

```bash
node ~/.openclaw/workspace/coordinator/tools/texpage.mjs talk.md --dpi 200
pdfinfo talk.pdf | grep Pages    # must say 1; only page 1 becomes the PNG
```

Page md syntax: `# Heading`, `$$ ... $$` numbered by `(#1.1)` after the closing `$$`,
`$inline$`, `- item`. Tighten CSS (10pt body, line-height 1.74, margins 18/18/12/18mm)
before shrinking type further.

## Result preferences

- Strips are the default shape; a full page is the exception for chained derivations.
- Keep the code block as the copyable source and the image as the display; never replace one with the other.
- White strip background, Computer Modern, tight autocrop, no equation numbers on strips.
- State in prose why a step holds; leave the symbols to the images.
