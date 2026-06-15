using System.IO;
using Xunit;

namespace SheetCompressor.Tests;

public class PromptsTests
{
    [Fact]
    public void Prompts_are_byte_equal_to_canonical_source()
    {
        // SPEC §10: the C# prompts surface MUST equal the canonical files in
        // the repo's prompts/ tree byte-for-byte.
        var root = FindPromptsRoot();
        var p = PromptsLoader.Instance;

        Assert.Equal(File.ReadAllText(Path.Combine(root, "readers", "anchor.md")), p.Readers.Anchor);
        Assert.Equal(File.ReadAllText(Path.Combine(root, "readers", "invertedIndex.md")), p.Readers.InvertedIndex);
        Assert.Equal(File.ReadAllText(Path.Combine(root, "readers", "formatAggregation.md")), p.Readers.FormatAggregation);
        Assert.Equal(File.ReadAllText(Path.Combine(root, "tasks", "tableRegionDetection.md")), p.Tasks.TableRegionDetection);
        Assert.Equal(File.ReadAllText(Path.Combine(root, "tasks", "cellValueLookup.md")), p.Tasks.CellValueLookup);
        Assert.Equal(File.ReadAllText(Path.Combine(root, "tasks", "sheetQA.md")), p.Tasks.SheetQA);
        Assert.Equal(File.ReadAllText(Path.Combine(root, "snippets", "chartDescriptor.md")), p.Snippets.ChartDescriptor);
    }

    private static string FindPromptsRoot()
    {
        var dir = System.AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            var candidate = Path.Combine(dir, "prompts");
            if (File.Exists(Path.Combine(candidate, "readers", "anchor.md"))) return candidate;
            var parent = Directory.GetParent(dir);
            if (parent is null) break;
            dir = parent.FullName;
        }
        throw new DirectoryNotFoundException("prompts/ not found");
    }
}
