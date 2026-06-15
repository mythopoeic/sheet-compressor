using Xunit;

namespace SheetCompressor.Tests;

public class StrategiesTests
{
    [Fact]
    public void Default_strategy_is_phase1()
    {
        // SPEC §3.1: the built-in default is phase1.
        var strategy = Strategies.Resolve(null);
        Assert.Equal("phase1", strategy.Name);
    }

    [Fact]
    public void Resolve_keep_all_by_name()
    {
        var strategy = Strategies.Resolve("keep-all");
        Assert.Equal("keep-all", strategy.Name);
    }

    [Fact]
    public void Keep_all_keeps_every_row_and_column()
    {
        var grid = new Grid
        {
            Rows = new[]
            {
                new[] { "a", "b" },
                new[] { "c", "d" },
            },
            Origin = new Origin(1, 1),
        };
        var detection = Strategies.KeepAll.Detect(grid);
        Assert.Equal(new[] { 0, 1 }, detection.KeptRows.OrderBy(x => x).ToArray());
        Assert.Equal(new[] { 0, 1 }, detection.KeptCols.OrderBy(x => x).ToArray());
    }

    [Fact]
    public void Phase1_returns_empty_on_empty_grid()
    {
        var grid = new Grid
        {
            Rows = System.Array.Empty<IReadOnlyList<string>>(),
            Origin = new Origin(1, 1),
        };
        var detection = Strategies.Phase1.Detect(grid);
        Assert.Empty(detection.KeptRows);
        Assert.Empty(detection.KeptCols);
    }
}
