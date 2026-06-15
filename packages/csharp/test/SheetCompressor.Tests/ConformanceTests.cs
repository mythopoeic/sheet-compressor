using System.Collections.Generic;
using System.IO;
using SheetCompressor.Json;
using Xunit;

namespace SheetCompressor.Tests;

public class ConformanceTests
{
    public static IEnumerable<object[]> Fixtures()
    {
        foreach (var fx in FixtureLoader.LoadAll())
        {
            yield return new object[] { fx.Id };
        }
    }

    [Theory]
    [MemberData(nameof(Fixtures))]
    public void Fixture_matches_all_goldens(string id)
    {
        var fx = FindFixture(id);
        var result = Compressor.Compress(fx.Input);
        var goldenDir = Path.Combine(fx.Dir, "golden");

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "anchor.string.txt")),
            result.Encodings.Anchor.String);

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "anchor.json")),
            CanonicalJson.Serialize((AnchorJson)result.Encodings.Anchor.Json));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "anchor.tokenEstimate.txt")).Trim(),
            result.Encodings.Anchor.TokenEstimate.ToString(System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "invertedIndex.string.txt")),
            result.Encodings.InvertedIndex.String);

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "invertedIndex.json")),
            CanonicalJson.Serialize((InvertedIndexJson)result.Encodings.InvertedIndex.Json));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "invertedIndex.tokenEstimate.txt")).Trim(),
            result.Encodings.InvertedIndex.TokenEstimate.ToString(System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "formatAggregation.string.txt")),
            result.Encodings.FormatAggregation.String);

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "formatAggregation.json")),
            CanonicalJson.Serialize((FormatAggregationJson)result.Encodings.FormatAggregation.Json));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "formatAggregation.tokenEstimate.txt")).Trim(),
            result.Encodings.FormatAggregation.TokenEstimate.ToString(System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "rawBaseline.tokenEstimate.txt")).Trim(),
            result.RawBaseline.TokenEstimate.ToString(System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(
            File.ReadAllText(Path.Combine(goldenDir, "charts.json")),
            CanonicalJson.SerializeCharts(result.Charts));
    }

    private static Fixture FindFixture(string id)
    {
        foreach (var fx in FixtureLoader.LoadAll())
        {
            if (fx.Id == id) return fx;
        }
        throw new KeyNotFoundException($"fixture not found: {id}");
    }
}
