Attribute VB_Name = "ScHarness"
'@Folder("SheetCompressor.Harness")
' =====================================================================
' ScHarness  --  the conformance macro (SPEC sec.9).
'
' For every fixture under <corpus>/* it:
'   1. reads input.json from disk (ScHost.ReadUtf8File) and parses it
'      (ScFixtures.GridFromInputJson via JsonConverter),
'   2. runs ScCompress.Compress (default phase1, the corpus counter = heuristic),
'   3. diffs BYTE-FOR-BYTE against the goldens:
'        anchor / invertedIndex / formatAggregation : .string.txt, .json,
'                                                      .tokenEstimate.txt
'        charts.json
'        rawBaseline.tokenEstimate.txt
'   4. accumulates a PASS/FAIL report (per-fixture line + first mismatch detail)
'      and writes it to <corpus>/../vba-conformance-report.txt and the Immediate
'      window.
'
' Corpus path is configurable: default = <workbook folder>\..\..\fixtures\corpus
' (the repo layout when the .xlsm lives in packages/vba/). Override by passing a
' path to RunConformance, or edit DefaultCorpusPath.
'
' Comparison is on the exact text. Golden .string.txt files have NO trailing
' newline; .json and .tokenEstimate.txt files DO end with a newline. We compare
' produced-string to the file verbatim, and append the newline ourselves where
' the golden has one (json: our serializer already ends with \n; token files: we
' append \n to the integer).
' =====================================================================
Option Explicit

' Entry point: run with the default corpus path.
Public Sub RunConformance()
    RunConformanceAt DefaultCorpusPath()
End Sub

' Default corpus path, relative to the host workbook (packages/vba/<wb> ->
' ../../fixtures/corpus). Falls back to the current dir if no workbook.
Public Function DefaultCorpusPath() As String
    Dim base As String
    On Error Resume Next
    base = Application.ThisWorkbook.path
    On Error GoTo 0
    If base = "" Then base = CurDir$
    ' packages/vba -> repo root is two levels up.
    DefaultCorpusPath = base & "\..\..\fixtures\corpus"
End Function

' Run conformance against an explicit corpus folder. Returns True iff all pass.
Public Function RunConformanceAt(ByVal corpusPath As String) As Boolean
    Dim report As StringBuilder
    Set report = New StringBuilder

    Dim total As Long, passed As Long, failed As Long
    total = 0: passed = 0: failed = 0

    report.Append "SheetCompressor VBA conformance" & vbCrLf
    report.Append "corpus: " & corpusPath & vbCrLf
    report.Append String$(60, "-") & vbCrLf

    Dim names As Collection
    Set names = ListFixtureDirs(corpusPath)

    Dim i As Long
    For i = 1 To names.Count
        Dim fixName As String
        fixName = names.Item(i)
        total = total + 1

        Dim firstMismatch As String
        Dim ok As Boolean
        ok = CheckFixture(corpusPath, fixName, firstMismatch)

        If ok Then
            passed = passed + 1
            report.Append "PASS  " & fixName & vbCrLf
        Else
            failed = failed + 1
            report.Append "FAIL  " & fixName & vbCrLf
            report.Append "        " & firstMismatch & vbCrLf
        End If
    Next i

    report.Append String$(60, "-") & vbCrLf
    report.Append "total=" & total & "  passed=" & passed & "  failed=" & failed & vbCrLf
    If failed = 0 And total > 0 Then
        report.Append "RESULT: ALL PASS" & vbCrLf
    ElseIf total = 0 Then
        report.Append "RESULT: NO FIXTURES FOUND (check corpus path)" & vbCrLf
    Else
        report.Append "RESULT: " & failed & " FAILED" & vbCrLf
    End If

    Dim reportText As String
    reportText = report.ToString()
    Debug.Print reportText

    Dim reportPath As String
    reportPath = corpusPath & "\..\vba-conformance-report.txt"
    On Error Resume Next
    ScHost.WriteUtf8File reportPath, reportText
    On Error GoTo 0

    RunConformanceAt = (failed = 0 And total > 0)
End Function

' Compare one fixture. Sets firstMismatch (ByRef) to a description of the first
' diff found, in a deterministic check order.
Private Function CheckFixture(ByVal corpusPath As String, ByVal fixName As String, _
                              ByRef firstMismatch As String) As Boolean
    Dim base As String
    base = corpusPath & "\" & fixName

    Dim inputText As String
    inputText = ScHost.ReadUtf8File(base & "\input.json")

    Dim g As Grid
    Set g = ScFixtures.GridFromInputJson(inputText)

    Dim res As CompressResult
    Set res = ScCompress.Compress(g, "phase1")

    Dim gld As String
    gld = base & "\golden"

    ' anchor
    If Not Cmp(res.Anchor.StringForm, gld & "\anchor.string.txt", False, fixName & " anchor.string", firstMismatch) Then GoTo failed
    If Not Cmp(res.Anchor.JsonForm, gld & "\anchor.json", True, fixName & " anchor.json", firstMismatch) Then GoTo failed
    If Not CmpInt(res.Anchor.TokenEstimate, gld & "\anchor.tokenEstimate.txt", fixName & " anchor.tokenEstimate", firstMismatch) Then GoTo failed

    ' invertedIndex
    If Not Cmp(res.InvertedIndex.StringForm, gld & "\invertedIndex.string.txt", False, fixName & " invertedIndex.string", firstMismatch) Then GoTo failed
    If Not Cmp(res.InvertedIndex.JsonForm, gld & "\invertedIndex.json", True, fixName & " invertedIndex.json", firstMismatch) Then GoTo failed
    If Not CmpInt(res.InvertedIndex.TokenEstimate, gld & "\invertedIndex.tokenEstimate.txt", fixName & " invertedIndex.tokenEstimate", firstMismatch) Then GoTo failed

    ' formatAggregation
    If Not Cmp(res.FormatAggregation.StringForm, gld & "\formatAggregation.string.txt", False, fixName & " formatAggregation.string", firstMismatch) Then GoTo failed
    If Not Cmp(res.FormatAggregation.JsonForm, gld & "\formatAggregation.json", True, fixName & " formatAggregation.json", firstMismatch) Then GoTo failed
    If Not CmpInt(res.FormatAggregation.TokenEstimate, gld & "\formatAggregation.tokenEstimate.txt", fixName & " formatAggregation.tokenEstimate", firstMismatch) Then GoTo failed

    ' charts + rawBaseline
    If Not Cmp(res.ChartsJson, gld & "\charts.json", True, fixName & " charts.json", firstMismatch) Then GoTo failed
    If Not CmpInt(res.RawBaselineTokens, gld & "\rawBaseline.tokenEstimate.txt", fixName & " rawBaseline.tokenEstimate", firstMismatch) Then GoTo failed

    firstMismatch = ""
    CheckFixture = True
    Exit Function
failed:
    CheckFixture = False
End Function

' Compare produced text against a golden file. When goldenHasTrailingNl, the file
' is expected to end with a single LF that the produced text does not carry
' inline (json: our serializer already ends with \n so produced carries it;
' string.txt: produced has none and golden has none). We therefore compare the
' raw bytes of `produced` against the raw file content directly.
Private Function Cmp(ByVal produced As String, ByVal goldenFile As String, _
                     ByVal goldenHasTrailingNl As Boolean, ByVal label As String, _
                     ByRef firstMismatch As String) As Boolean
    Dim golden As String
    golden = ScHost.ReadUtf8File(goldenFile)
    ' Normalise any stray CR the reader might surface is NOT done -- goldens are
    ' LF-only and our output is LF-only, so an exact compare is the contract.
    If StrComp(produced, golden, vbBinaryCompare) = 0 Then
        Cmp = True
    Else
        firstMismatch = label & ": " & DescribeDiff(produced, golden)
        Cmp = False
    End If
End Function

' Compare an integer against a token golden file (an integer followed by a
' single trailing LF).
Private Function CmpInt(ByVal produced As Long, ByVal goldenFile As String, _
                        ByVal label As String, ByRef firstMismatch As String) As Boolean
    Dim golden As String
    golden = ScHost.ReadUtf8File(goldenFile)
    Dim expected As String
    expected = CStr(produced) & vbLf      ' goldens end with a single LF
    If StrComp(expected, golden, vbBinaryCompare) = 0 Then
        CmpInt = True
    Else
        firstMismatch = label & ": produced=" & produced & " golden=[" & EscapeForReport(golden) & "]"
        CmpInt = False
    End If
End Function

' First-difference locator for a readable report line.
Private Function DescribeDiff(ByVal a As String, ByVal b As String) As String
    Dim la As Long, lb As Long, n As Long, i As Long
    la = Len(a): lb = Len(b)
    n = la: If lb < n Then n = lb
    For i = 1 To n
        If Mid$(a, i, 1) <> Mid$(b, i, 1) Then
            DescribeDiff = "first diff at char " & i & _
                " produced=" & CharDesc(Mid$(a, i, 1)) & _
                " golden=" & CharDesc(Mid$(b, i, 1)) & _
                " (lenP=" & la & " lenG=" & lb & ")"
            Exit Function
        End If
    Next i
    DescribeDiff = "length differs lenP=" & la & " lenG=" & lb & _
        " (common prefix of " & n & " chars matches)"
End Function

Private Function CharDesc(ByVal ch As String) As String
    If ch = "" Then
        CharDesc = "<none>"
    Else
        CharDesc = "U+" & Right$("0000" & Hex$(AscW(ch) And &HFFFF&), 4) & " '" & ch & "'"
    End If
End Function

Private Function EscapeForReport(ByVal s As String) As String
    Dim r As String
    r = Replace(s, vbCr, "\r")
    r = Replace(r, vbLf, "\n")
    r = Replace(r, vbTab, "\t")
    EscapeForReport = r
End Function

' Enumerate immediate sub-directories of corpusPath (each is a fixture).
' Two-phase: collect ALL Dir() names first (nested Dir/GetAttr calls would reset
' the Dir enumerator), then filter to directories containing an input.json.
' Sorted alphabetically so the report order is stable.
Private Function ListFixtureDirs(ByVal corpusPath As String) As Collection
    Dim raw As Collection
    Set raw = New Collection
    Dim nm As String
    nm = Dir(corpusPath & "\*", vbDirectory)
    Do While nm <> ""
        If nm <> "." And nm <> ".." Then raw.Add nm
        nm = Dir
    Loop

    ' Filter (now safe to call GetAttr / Dir).
    Dim filtered As Collection
    Set filtered = New Collection
    Dim i As Long, full As String
    For i = 1 To raw.Count
        full = corpusPath & "\" & raw.Item(i)
        If (GetAttr(full) And vbDirectory) = vbDirectory Then
            If Dir(full & "\input.json") <> "" Then filtered.Add raw.Item(i)
        End If
    Next i

    Set ListFixtureDirs = SortCollection(filtered)
End Function

' Simple insertion sort of a String Collection (corpus is ~14 items).
Private Function SortCollection(ByVal c As Collection) As Collection
    Dim arr() As String
    If c.Count = 0 Then
        Set SortCollection = c
        Exit Function
    End If
    ReDim arr(0 To c.Count - 1)
    Dim i As Long
    For i = 1 To c.Count
        arr(i - 1) = c.Item(i)
    Next i
    Dim j As Long, key As String
    For i = 1 To UBound(arr)
        key = arr(i)
        j = i - 1
        Do While j >= 0
            If StrComp(arr(j), key, vbBinaryCompare) > 0 Then
                arr(j + 1) = arr(j)
                j = j - 1
            Else
                Exit Do
            End If
        Loop
        arr(j + 1) = key
    Next i
    Dim out As Collection
    Set out = New Collection
    For i = 0 To UBound(arr)
        out.Add arr(i)
    Next i
    Set SortCollection = out
End Function
