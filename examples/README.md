# Examples

## `aetherium-576x23-sparse`

A 576 × 23 sheet in the spirit of Figure 2 of the [SpreadsheetLLM paper](https://arxiv.org/abs/2407.09025)
(whose original example is 576 × 23 but lives only in the paper's external supplementary
materials). This is an independent reconstruction: every cell observable in the PDF's Figure 2
is placed verbatim at its address (the top cluster — `A2 Atlantis`, `C2 1064955`,
`B2:B4 QuantumMind`, `D2:D18 20-Aug`, `F5 Atlantis`/`G5 1797915`/`H5 9.13%`, `G16 19700822`,
`H16 100.00%`, …), and the rest is invented in the same style (the fictional "Aetherium
Exchange" trading ledger).

The sheet is deliberately **sparse** — two tables in columns A–H embedded in a mostly-empty
canvas, with large blank row-blocks between data clusters and empty columns I–W — so all three
SheetCompressor stages have something to compress:

| stage | tokens | ratio |
| --- | --- | --- |
| raw baseline | 10,110 | — |
| structural-anchor skeleton | 807 | 12.5× |
| inverted index | 456 | 22.2× |
| format aggregation | 160 | 63.2× |

Files:
- `aetherium-576x23-sparse.xlsx` — opens in Excel.
- `aetherium-576x23-sparse.grid.json` — the same data in the core `compress()` input contract
  (`{ rows, origin }`), so you can feed it straight into the library.
