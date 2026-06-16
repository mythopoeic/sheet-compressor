Attribute VB_Name = "ScTokens"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScTokens  --  the v0 heuristic token counter + the raw-baseline encoder.
' Mirrors packages/typescript/src/tokens.ts (estimateTokens) and
'         packages/typescript/src/baseline.ts (vanillaEncode).   SPEC sec.7.
'
' SPEC sec.7:  tokens(s) = ceil(length_in_utf16_code_units(s) / 4),  tokens("") = 0.
' VBA String is a BSTR == UTF-16, so VBA Len() already counts UTF-16 code units
' (a non-BMP char such as U+1F600 is two code units, exactly like JS .length).
' No surrogate conversion is needed here -- unlike Python/Go ports.
'
' This REPLACES the legacy sources/vba/.../Tokenizer.bas, whose counting did not
' match the SPEC heuristic.
' =====================================================================
Option Explicit

' SPEC sec.7 heuristic. ceil(n/4) computed with integer math: (n + 3) \ 4.
Public Function EstimateTokens(ByVal s As String) As Long
    Dim n As Long
    n = Len(s)
    If n = 0 Then
        EstimateTokens = 0
    Else
        EstimateTokens = (n + 3) \ 4
    End If
End Function

' SPEC sec.7 vanilla baseline: rows joined with " | " (space-pipe-space), rows
' separated by vbLf, NO escaping and NO address prefixes. Mirrors TS
' vanillaEncode(): grid.rows.map(row => row.join(" | ")).join("\n").
'
' CRITICAL: the baseline operates on the ORIGINAL ragged rows, NOT the padded
' rectangle. A row shorter than ColCount contributes only its own cells (and so
' fewer " | " separators). The TS reference maps over grid.rows (ragged) before
' any padding. We honour that via Grid.BaselineRowLen(r). (The encodings, by
' contrast, do see the padded rectangle -- SPEC sec.1.)
Public Function VanillaEncode(ByVal g As Grid) As String
    If g.RowCount = 0 Then
        VanillaEncode = ""
        Exit Function
    End If

    Dim lines() As String
    ReDim lines(0 To g.RowCount - 1)

    Dim r As Long, c As Long
    For r = 0 To g.RowCount - 1
        Dim rowLen As Long
        rowLen = g.BaselineRowLen(r)
        If rowLen <= 0 Then
            ' A row with zero cells joins to "" (matches [].join(" | ") === "").
            lines(r) = ""
        Else
            Dim cellsArr() As String
            ReDim cellsArr(0 To rowLen - 1)
            For c = 0 To rowLen - 1
                cellsArr(c) = g.Cells(r, c)
            Next c
            lines(r) = Join(cellsArr, " | ")
        End If
    Next r

    VanillaEncode = Join(lines, vbLf)
End Function
