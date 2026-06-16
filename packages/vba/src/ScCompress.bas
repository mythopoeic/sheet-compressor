Attribute VB_Name = "ScCompress"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScCompress  --  the top-level pure entry point.
' Mirrors packages/typescript/src/compress.ts.
'
' Compress(grid, strategyName) ->
'   * runs anchor detection (default "phase1")
'   * encodes anchor / inverted-index / format-aggregation
'   * renders the chart block, appends it to each encoding's string, and
'     re-measures tokenEstimate over the EXTENDED string (TS withCharts)
'   * computes rawBaseline tokenEstimate over the vanilla baseline (charts NOT
'     included -- SPEC sec.6.3)
'   * echoes charts.json
'
' Token counting uses the SPEC sec.7 heuristic (ScTokens.EstimateTokens) -- the
' only counter the cross-language conformance corpus is built against.
'
' Also provides NewGridFromArray, the canonical way host glue / the harness
' builds a Grid from a rectangular Variant array (no Excel dependency here).
' =====================================================================
Option Explicit

' Build the canonical phase1 result. strategyName "" or "phase1" -> phase1;
' "keep-all" -> keep-all.
Public Function Compress(ByVal g As Grid, Optional ByVal strategyName As String = "phase1") As CompressResult
    Dim keptRows() As Boolean, keptCols() As Boolean
    ScStrategy.Detect g, strategyName, keptRows, keptCols

    Dim chartBlock As String
    chartBlock = ScEncodings.RenderChartBlock(g.Charts)

    Dim res As CompressResult
    Set res = New CompressResult

    Set res.Anchor = WithCharts(ScEncodings.EncodeAnchor(g, keptRows, keptCols), chartBlock)
    Set res.InvertedIndex = WithCharts(ScEncodings.EncodeInvertedIndex(g), chartBlock)
    Set res.FormatAggregation = WithCharts(ScFormatAgg.EncodeFormatAggregation(g), chartBlock)

    res.ChartsJson = ScJson.SerializeCharts(g.Charts)
    res.RawBaselineTokens = ScTokens.EstimateTokens(ScTokens.VanillaEncode(g))

    Set Compress = res
End Function

' SPEC sec.6.2: extend the encoding string with the chart block (if any) and
' (re)compute tokenEstimate over the extended string. JSON unchanged. Mirrors
' TS withCharts(). When chartBlock is "", string is unchanged but we still set
' TokenEstimate (the encoders leave it unset).
Private Function WithCharts(ByVal enc As Encoding, ByVal chartBlock As String) As Encoding
    enc.StringForm = ScEncodings.AppendChartBlock(enc.StringForm, chartBlock)
    enc.TokenEstimate = ScTokens.EstimateTokens(enc.StringForm)
    Set WithCharts = enc
End Function

' ---------------------------------------------------------------------
' NewGridFromArray  --  build a Grid from a rectangular 2D array of cell values.
'
'   data        : 2D Variant array. Lower bounds may be 0 or 1 (Excel ranges are
'                 1-based; in-memory arrays are usually 0-based). Values are
'                 coerced to String; Empty/Null -> "".
'   originRow   : 1-indexed A1 row of the top-left cell.
'   originCol   : 1-indexed A1 col of the top-left cell.
'
' No Excel objects are touched -- host glue converts a Range to a Variant array
' first, then calls this. cellMeta/charts are attached by the caller afterwards.
' ---------------------------------------------------------------------
Public Function NewGridFromArray(ByVal data As Variant, ByVal originRow As Long, _
                                 ByVal originCol As Long) As Grid
    Dim g As Grid
    Set g = New Grid
    g.OriginRow = originRow
    g.OriginCol = originCol

    If IsEmpty(data) Then
        g.RowCount = 0
        g.ColCount = 0
        Set NewGridFromArray = g
        Exit Function
    End If

    Dim rLo As Long, rHi As Long, cLo As Long, cHi As Long
    rLo = LBound(data, 1): rHi = UBound(data, 1)
    cLo = LBound(data, 2): cHi = UBound(data, 2)

    Dim nR As Long, nC As Long
    nR = rHi - rLo + 1
    nC = cHi - cLo + 1
    g.RowCount = nR
    g.ColCount = nC

    If nR > 0 And nC > 0 Then
        ReDim g.Cells(0 To nR - 1, 0 To nC - 1)
        Dim r As Long, c As Long
        For r = 0 To nR - 1
            For c = 0 To nC - 1
                g.Cells(r, c) = CoerceCellString(data(rLo + r, cLo + c))
            Next c
        Next r
    End If

    Set NewGridFromArray = g
End Function

' Empty/Null -> ""; everything else -> CStr. Errors (e.g. #N/A) -> "".
' NOTE: numeric coercion here uses VBA CStr, which is locale-dependent for
' Doubles. Host glue should generally pass already-stringified text (e.g. the
' cell .Text / .Value2 already as text). This helper exists for convenience; the
' conformance harness builds Grids from JSON strings, never via this path.
Private Function CoerceCellString(ByVal v As Variant) As String
    If IsError(v) Then
        CoerceCellString = ""
    ElseIf IsNull(v) Then
        CoerceCellString = ""
    ElseIf IsEmpty(v) Then
        CoerceCellString = ""
    Else
        CoerceCellString = CStr(v)
    End If
End Function
