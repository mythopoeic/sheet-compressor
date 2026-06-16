Attribute VB_Name = "ScEscape"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScEscape  --  value escaping for the string encodings.
' Mirrors packages/typescript/src/encodings/escape.ts  (SPEC sec.3.2, reused sec.4.4)
' and the chart-token escapers in encodings/chartDescriptors.ts (SPEC sec.6.1).
'
' CRITICAL: backslash is replaced FIRST so the backslashes introduced by the
' later rules are not themselves double-escaped (SPEC sec.3.2: "rule (1) first").
' VBA Replace is a plain substring replace (no regex), which is exactly what the
' TS .replace(/.../g, ...) calls do here.
' =====================================================================
Option Explicit

' SPEC sec.3.2 rules 1-6: \ , | \n \r \t  (in that order). Shared by anchor (sec.3.2)
' and inverted-index (sec.4.4). Mirrors TS escapeValue().
Public Function EscapeValue(ByVal v As String) As String
    Dim s As String
    s = v
    s = Replace(s, "\", "\\")        ' rule 1 FIRST
    s = Replace(s, ",", "\,")        ' rule 2
    s = Replace(s, "|", "\|")        ' rule 3
    s = Replace(s, vbLf, "\n")       ' rule 4  (vbLf = Chr(10))
    s = Replace(s, vbCr, "\r")       ' rule 5  (vbCr = Chr(13))
    s = Replace(s, vbTab, "\t")      ' rule 6  (vbTab = Chr(9))
    EscapeValue = s
End Function

' SPEC sec.6.1: contents of a double-quoted chart field (title / xAxis / yAxis).
' Backslash first, then the quote, then the whitespace controls.
' Mirrors TS escapeQuoted().
Public Function EscapeQuoted(ByVal s As String) As String
    Dim r As String
    r = s
    r = Replace(r, "\", "\\")
    r = Replace(r, """", "\""")      ' " -> \"
    r = Replace(r, vbLf, "\n")
    r = Replace(r, vbCr, "\r")
    r = Replace(r, vbTab, "\t")
    EscapeQuoted = r
End Function

' SPEC sec.6.1: a single series name inside series=[...]. Backslash first, then the
' bracket-list delimiters ( , and ] ), then whitespace controls.
' Mirrors TS escapeSeriesName().
Public Function EscapeSeriesName(ByVal s As String) As String
    Dim r As String
    r = s
    r = Replace(r, "\", "\\")
    r = Replace(r, ",", "\,")
    r = Replace(r, "]", "\]")
    r = Replace(r, vbLf, "\n")
    r = Replace(r, vbCr, "\r")
    r = Replace(r, vbTab, "\t")
    EscapeSeriesName = r
End Function
