using System;
using System.Collections.Generic;
using System.IO;

namespace SheetCompressor;

public sealed record PromptReaders
{
    public required string Anchor { get; init; }
    public required string InvertedIndex { get; init; }
    public required string FormatAggregation { get; init; }
}

public sealed record PromptTasks
{
    public required string TableRegionDetection { get; init; }
    public required string CellValueLookup { get; init; }
    public required string SheetQA { get; init; }
}

public sealed record PromptSnippets
{
    public required string ChartDescriptor { get; init; }
}

public sealed record Prompts
{
    public required PromptReaders Readers { get; init; }
    public required PromptTasks Tasks { get; init; }
    public required PromptSnippets Snippets { get; init; }
}

public static class PromptsLoader
{
    private static readonly Lazy<Prompts> _instance = new(Load);

    public static Prompts Instance => _instance.Value;

    private static string PromptsRoot()
    {
        // Search order mirrors the TS reference (SPEC §10.2):
        //   1. Sibling of the assembly — the published-package layout.
        //   2. Repo root — the in-repo monorepo layout (packages/csharp/...
        //      → ../../../prompts).
        var asmDir = AppContext.BaseDirectory;
        var candidates = new List<string>
        {
            Path.Combine(asmDir, "prompts"),
            Path.Combine(asmDir, "..", "..", "..", "prompts"),
            Path.Combine(asmDir, "..", "..", "..", "..", "..", "..", "prompts"),
            Path.Combine(asmDir, "..", "..", "..", "..", "..", "..", "..", "prompts"),
        };
        foreach (var dir in candidates)
        {
            if (File.Exists(Path.Combine(dir, "readers", "anchor.md")))
            {
                return Path.GetFullPath(dir);
            }
        }
        throw new FileNotFoundException(
            $"sheet-compressor: prompts/ not found; searched {string.Join(", ", candidates)}");
    }

    private static Prompts Load()
    {
        var root = PromptsRoot();
        string ReadFile(string rel) => File.ReadAllText(Path.Combine(root, rel));
        return new Prompts
        {
            Readers = new PromptReaders
            {
                Anchor = ReadFile(Path.Combine("readers", "anchor.md")),
                InvertedIndex = ReadFile(Path.Combine("readers", "invertedIndex.md")),
                FormatAggregation = ReadFile(Path.Combine("readers", "formatAggregation.md")),
            },
            Tasks = new PromptTasks
            {
                TableRegionDetection = ReadFile(Path.Combine("tasks", "tableRegionDetection.md")),
                CellValueLookup = ReadFile(Path.Combine("tasks", "cellValueLookup.md")),
                SheetQA = ReadFile(Path.Combine("tasks", "sheetQA.md")),
            },
            Snippets = new PromptSnippets
            {
                ChartDescriptor = ReadFile(Path.Combine("snippets", "chartDescriptor.md")),
            },
        };
    }
}
