Attribute VB_Name = "ScAddress"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScAddress  --  A1 address helpers.
' Mirrors packages/typescript/src/address.ts  (SPEC sec.1.1).
' =====================================================================
Option Explicit

' 1-indexed column number -> Excel column letters.
'   1 -> "A", 26 -> "Z", 27 -> "AA", 52 -> "AZ", 702 -> "ZZ", 703 -> "AAA".
' Mirrors TS colToLetters().
Public Function ColToLetters(ByVal col As Long) As String
    If col < 1 Then
        Err.Raise vbObjectError + 1, "ScAddress.ColToLetters", _
            "column must be a positive integer, got " & col
    End If
    Dim n As Long, rem_ As Long, outStr As String
    n = col
    outStr = ""
    Do While n > 0
        rem_ = (n - 1) Mod 26
        outStr = Chr$(65 + rem_) & outStr
        n = (n - 1) \ 26          ' \ is integer division == Math.floor for positives
    Loop
    ColToLetters = outStr
End Function

' Format an A1 address from 1-indexed (row, col). Mirrors TS a1().
Public Function A1(ByVal row As Long, ByVal col As Long) As String
    A1 = ColToLetters(col) & CStr(row)
End Function
