# SheetCompressor.Xlsx

Optional `.xlsx` adapter for [`SheetCompressor`](https://www.nuget.org/packages/SheetCompressor),
built on [ClosedXML](https://github.com/ClosedXML/ClosedXML). Reads a single worksheet — grid,
origin, per-cell data type, and embedded chart descriptors — into the `SheetCompressor.Grid`
shape so you can compress a workbook directly.

> Independent, community implementation. Not affiliated with or endorsed by Microsoft.
> Part of the multi-language
> [`sheet-compressor`](https://github.com/mythopoeic/sheet-compressor) project.

## Install

```bash
dotnet add package SheetCompressor.Xlsx
```

(pulls in the core `SheetCompressor` package automatically.)

## Usage

```csharp
using SheetCompressor;
using SheetCompressor.Xlsx;

var grid = XlsxReader.ReadSheetFile("workbook.xlsx");   // first sheet
var result = Compressor.Compress(grid);
Console.WriteLine(result.Encodings.Anchor.String);
```

## License

[MIT](https://github.com/mythopoeic/sheet-compressor/blob/main/LICENSE).
