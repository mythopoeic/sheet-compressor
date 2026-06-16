# sheet-compressor (Go port)

Go implementation of the [`sheet-compressor`](../../README.md) compression core.
Pure stdlib — no third-party dependencies in the default build. The
language-neutral contract is [`spec/SPEC.md`](../../spec/SPEC.md); behaviour is
verified against the shared golden corpus in [`fixtures/corpus`](../../fixtures/corpus).

## Install

```sh
go get github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor
```

## Use

```go
import "github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"

grid := &sheetcompressor.Grid{
    Rows: [][]string{
        {"Name", "Qty", "Price"},
        {"Apple", "3", "1.50"},
    },
    Origin: sheetcompressor.Origin{Row: 1, Col: 1},
}
result := sheetcompressor.Compress(grid, sheetcompressor.Options{})

fmt.Println(result.Anchor.String)
fmt.Println(result.InvertedIndex.String)
fmt.Println(result.FormatAggregation.String)
fmt.Println(result.RawBaseline.TokenEstimate, "→", result.Anchor.TokenEstimate)
```

`Options` is fully optional: a `nil` `AnchorStrategy` selects the SPEC §3.1.2
phase-1 detector, and a `nil` `TokenCounter` selects the SPEC §7 heuristic
(UTF-16 code units ÷ 4, ceil).

## Optional .xlsx adapter

A thin [excelize](https://github.com/xuri/excelize)-backed adapter lives in
`xlsx/`, gated behind the `sheetcompressor_excelize` build tag — without the
tag, `xlsx.ReadSheet` returns `xlsx.ErrAdapterUnavailable` so consumers can
fall back to building the `Grid` themselves (SPEC §8.2).

```go
import (
    "github.com/mythopoeic/sheet-compressor/packages/go/sheetcompressor"
    "github.com/mythopoeic/sheet-compressor/packages/go/xlsx"
)

grid, err := xlsx.ReadSheetFile("workbook.xlsx", xlsx.Options{})
if err != nil {
    return err
}
result := sheetcompressor.Compress(grid, sheetcompressor.Options{})
```

To enable the real adapter:

```sh
go get github.com/xuri/excelize/v2
go build -tags sheetcompressor_excelize ./...
```

`Options.SheetName` selects a sheet by name (wins over `SheetIndex`);
`Options.SheetIndex` selects by 0-indexed position; both omitted picks the
first sheet. The returned `Grid` carries the used-range origin, every cell's
inferred `DataType`, and any embedded chart descriptors the workbook exposes
via the OOXML drawing parts.

## Real tokenizer

The core is dependency-free. An optional tiktoken-go adapter lives in
`sheetcompressor/tiktoken`, gated behind the `sheetcompressor_tiktoken` build
tag — without the tag, `tiktoken.NewCounter()` returns
`tiktoken.ErrTokenizerUnavailable` so consumers can fall back to the heuristic.

```go
counter, err := tiktoken.NewCounter(tiktoken.Options{Encoding: "o200k_base"})
if err != nil {
    counter = sheetcompressor.EstimateTokens
}
result := sheetcompressor.Compress(grid, sheetcompressor.Options{TokenCounter: counter})
```

To enable the real adapter:

```sh
go get github.com/pkoukk/tiktoken-go
go build -tags sheetcompressor_tiktoken ./...
```

## Test

```sh
go test ./...
```

Runs the language-neutral conformance corpus from `fixtures/corpus/` plus
in-package unit tests. Every fixture's `anchor`, `invertedIndex`,
`formatAggregation`, `charts`, and `rawBaseline` outputs are byte-diffed
against the golden files in each fixture's `golden/` dir.
