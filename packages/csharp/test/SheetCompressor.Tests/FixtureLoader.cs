using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace SheetCompressor.Tests;

public sealed record FixtureMeta
{
    public required string Id { get; init; }
    public string Title { get; init; } = "";
    public string Description { get; init; } = "";
}

public sealed record Fixture
{
    public required string Id { get; init; }
    public required string Dir { get; init; }
    public required FixtureMeta Meta { get; init; }
    public required Grid Input { get; init; }
}

public static class FixtureLoader
{
    /// <summary>
    /// Walk up from the test assembly's BaseDirectory until we find
    /// <c>fixtures/corpus</c>. The conformance corpus lives at the repo root.
    /// </summary>
    public static string CorpusRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            var candidate = Path.Combine(dir, "fixtures", "corpus");
            if (Directory.Exists(candidate)) return Path.GetFullPath(candidate);
            var parent = Directory.GetParent(dir);
            if (parent is null) break;
            dir = parent.FullName;
        }
        throw new DirectoryNotFoundException(
            $"fixtures/corpus not found walking up from {AppContext.BaseDirectory}");
    }

    public static IReadOnlyList<Fixture> LoadAll(string? root = null)
    {
        root ??= CorpusRoot();
        var subdirs = Directory.GetDirectories(root);
        Array.Sort(subdirs, System.StringComparer.Ordinal);
        var list = new List<Fixture>(subdirs.Length);
        foreach (var dir in subdirs)
        {
            var id = Path.GetFileName(dir);
            var meta = LoadMeta(Path.Combine(dir, "meta.json"));
            var input = LoadInput(Path.Combine(dir, "input.json"));
            list.Add(new Fixture { Id = id, Dir = dir, Meta = meta, Input = input });
        }
        return list;
    }

    private static FixtureMeta LoadMeta(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream);
        var root = doc.RootElement;
        return new FixtureMeta
        {
            Id = root.GetProperty("id").GetString() ?? "",
            Title = root.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "",
            Description = root.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "",
        };
    }

    public static Grid LoadInput(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream);
        var root = doc.RootElement;

        var rowsEl = root.GetProperty("rows");
        var rows = new List<IReadOnlyList<string>>(rowsEl.GetArrayLength());
        foreach (var rowEl in rowsEl.EnumerateArray())
        {
            var row = new List<string>(rowEl.GetArrayLength());
            foreach (var cellEl in rowEl.EnumerateArray())
            {
                row.Add(cellEl.GetString() ?? "");
            }
            rows.Add(row);
        }

        var originEl = root.GetProperty("origin");
        var origin = new Origin(
            originEl.GetProperty("row").GetInt32(),
            originEl.GetProperty("col").GetInt32());

        IReadOnlyList<ChartDescriptor>? charts = null;
        if (root.TryGetProperty("charts", out var chartsEl)
            && chartsEl.ValueKind == JsonValueKind.Array)
        {
            var list = new List<ChartDescriptor>(chartsEl.GetArrayLength());
            foreach (var chartEl in chartsEl.EnumerateArray())
            {
                list.Add(ParseChart(chartEl));
            }
            charts = list;
        }

        IReadOnlyList<IReadOnlyList<CellMeta?>?>? cellMeta = null;
        if (root.TryGetProperty("cellMeta", out var cellMetaEl)
            && cellMetaEl.ValueKind == JsonValueKind.Array)
        {
            var outer = new List<IReadOnlyList<CellMeta?>?>(cellMetaEl.GetArrayLength());
            foreach (var rowEl in cellMetaEl.EnumerateArray())
            {
                if (rowEl.ValueKind != JsonValueKind.Array)
                {
                    outer.Add(null);
                    continue;
                }
                var inner = new List<CellMeta?>(rowEl.GetArrayLength());
                foreach (var entry in rowEl.EnumerateArray())
                {
                    if (entry.ValueKind == JsonValueKind.Object
                        && entry.TryGetProperty("dataType", out var dtEl))
                    {
                        var dt = ParseDataType(dtEl.GetString());
                        inner.Add(new CellMeta { DataType = dt });
                    }
                    else
                    {
                        inner.Add(null);
                    }
                }
                outer.Add(inner);
            }
            cellMeta = outer;
        }

        return new Grid
        {
            Rows = rows,
            Origin = origin,
            Charts = charts,
            CellMeta = cellMeta,
        };
    }

    private static ChartDescriptor ParseChart(JsonElement chartEl)
    {
        string? title = chartEl.TryGetProperty("title", out var titleEl) ? titleEl.GetString() : null;
        List<string>? dataRanges = null;
        if (chartEl.TryGetProperty("dataRanges", out var dataEl) && dataEl.ValueKind == JsonValueKind.Array)
        {
            dataRanges = new List<string>(dataEl.GetArrayLength());
            foreach (var r in dataEl.EnumerateArray()) dataRanges.Add(r.GetString() ?? "");
        }
        List<string>? series = null;
        if (chartEl.TryGetProperty("series", out var seriesEl) && seriesEl.ValueKind == JsonValueKind.Array)
        {
            series = new List<string>(seriesEl.GetArrayLength());
            foreach (var s in seriesEl.EnumerateArray()) series.Add(s.GetString() ?? "");
        }
        ChartAxes? axes = null;
        if (chartEl.TryGetProperty("axes", out var axesEl) && axesEl.ValueKind == JsonValueKind.Object)
        {
            axes = new ChartAxes
            {
                X = axesEl.TryGetProperty("x", out var xEl) ? xEl.GetString() : null,
                Y = axesEl.TryGetProperty("y", out var yEl) ? yEl.GetString() : null,
            };
        }

        return new ChartDescriptor
        {
            Name = chartEl.GetProperty("name").GetString() ?? "",
            Type = ParseChartType(chartEl.GetProperty("type").GetString()),
            AnchorRange = chartEl.GetProperty("anchorRange").GetString() ?? "",
            Title = title,
            DataRanges = dataRanges,
            Series = series,
            Axes = axes,
        };
    }

    private static ChartType ParseChartType(string? s) => s switch
    {
        "bar" => ChartType.Bar,
        "line" => ChartType.Line,
        "pie" => ChartType.Pie,
        "scatter" => ChartType.Scatter,
        "area" => ChartType.Area,
        "other" => ChartType.Other,
        _ => ChartType.Other,
    };

    private static DataType? ParseDataType(string? s) => s switch
    {
        "text" => DataType.Text,
        "number" => DataType.Number,
        "date" => DataType.Date,
        "bool" => DataType.Bool,
        "formula" => DataType.Formula,
        "error" => DataType.Error,
        "empty" => DataType.Empty,
        _ => null,
    };
}
