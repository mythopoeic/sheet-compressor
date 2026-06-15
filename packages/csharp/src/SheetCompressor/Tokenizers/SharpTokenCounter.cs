using System;
using SharpToken;

namespace SheetCompressor.Tokenizers;

/// <summary>
/// Real-tokenizer counter backed by SharpToken (SPEC §7). Returned counter is
/// model-specific and NOT part of the cross-language conformance contract —
/// the default heuristic (<see cref="Tokens.EstimateTokens"/>) is.
///
/// Pass the returned counter via <see cref="CompressOptions.TokenCounter"/>:
/// <code>
///   var tc = SharpTokenCounter.Create();
///   var result = Compressor.Compress(grid, new CompressOptions { TokenCounter = tc });
/// </code>
///
/// Defaults to the <c>o200k_base</c> encoding (GPT-4o / GPT-5 family), the
/// shared default across language ports.
/// </summary>
public static class SharpTokenCounter
{
    public const string DefaultEncoding = "o200k_base";

    public static TokenCounter Create(string encoding = DefaultEncoding)
    {
        if (string.IsNullOrEmpty(encoding))
        {
            throw new ArgumentException("encoding must not be empty", nameof(encoding));
        }
        var enc = GptEncoding.GetEncoding(encoding);
        return s => enc.CountTokens(s);
    }
}
