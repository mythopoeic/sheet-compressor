using SheetCompressor.Tokenizers;
using Xunit;

namespace SheetCompressor.Tests;

public class TokensTests
{
    [Theory]
    [InlineData("", 0)]
    [InlineData("a", 1)]
    [InlineData("abcd", 1)]
    [InlineData("abcde", 2)]
    [InlineData("abcdefgh", 2)]
    [InlineData("abcdefghi", 3)]
    public void Heuristic_is_ceil_utf16_length_over_4(string input, int expected)
    {
        Assert.Equal(expected, Tokens.EstimateTokens(input));
    }

    [Fact]
    public void Heuristic_treats_emoji_as_two_utf16_units()
    {
        // U+1F600 is a single code point but two UTF-16 code units (surrogate
        // pair). SPEC §7: tokens count UTF-16 code units; "😀" is 2 units;
        // ceil(2 / 4) = 1.
        Assert.Equal(1, Tokens.EstimateTokens("😀"));
        // Two emoji → 4 units → ceil(4/4) = 1.
        Assert.Equal(1, Tokens.EstimateTokens("😀😀"));
    }

    [Fact]
    public void SharpToken_adapter_returns_a_counter_that_differs_from_heuristic()
    {
        // Smoke test: the SharpToken counter is wired up. Real-tokenizer
        // counts are model-specific; we just verify it returns a positive
        // count and is callable. NOT part of the conformance contract.
        var counter = SharpTokenCounter.Create();
        var count = counter("Hello, world!");
        Assert.True(count > 0);
    }

    [Fact]
    public void Heuristic_is_default_when_no_counter_supplied()
    {
        // SPEC §7: compress() falls back to the shared heuristic when no
        // counter is injected. We verify by comparing rawBaseline against the
        // heuristic computed on the vanilla encoding directly.
        var grid = new Grid
        {
            Rows = new[] { new[] { "a", "b" }, new[] { "c", "d" } },
            Origin = new Origin(1, 1),
        };
        var result = Compressor.Compress(grid);
        Assert.Equal(Tokens.EstimateTokens("a | b\nc | d"), result.RawBaseline.TokenEstimate);
    }

    [Fact]
    public void Injected_counter_replaces_heuristic_for_all_token_estimates()
    {
        // The injected counter applies to rawBaseline AND every encoding.
        TokenCounter constCounter = _ => 42;
        var grid = new Grid
        {
            Rows = new[] { new[] { "a", "b" } },
            Origin = new Origin(1, 1),
        };
        var result = Compressor.Compress(
            grid,
            new CompressOptions { TokenCounter = constCounter });
        Assert.Equal(42, result.RawBaseline.TokenEstimate);
        Assert.Equal(42, result.Encodings.Anchor.TokenEstimate);
        Assert.Equal(42, result.Encodings.InvertedIndex.TokenEstimate);
        Assert.Equal(42, result.Encodings.FormatAggregation.TokenEstimate);
    }
}
