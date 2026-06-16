Attribute VB_Name = "ScFormatAgg"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScFormatAgg  --  SPEC sec.5 format-aggregation encoding.
' Mirrors packages/typescript/src/encodings/formatAggregation.ts.
'
'   Classify (sec.5.1) -> resolve year candidates by context (sec.5.1.1)
'   -> greedy rectangular merge (sec.5.2) -> emit in canonical type order (sec.5.3/sec.5.4).
'
' Classification uses VBScript.RegExp (late-bound CreateObject) so no project
' reference is required. The patterns are the EXACT TS regexes; VBScript regex
' is PCRE-ish and supports all constructs used here (anchors, char classes,
' alternation, optional groups, case-insensitive). The currency class contains
' the literal non-ASCII glyphs $ EUR GBP YEN -- VBScript matches them as literal
' UTF-16 chars, matching the TS [$<euro><pound><yen>] class.
' =====================================================================
Option Explicit

' Canonical emission order (SPEC sec.5.1 / TS TYPE_ORDER).
Private Function TypeOrder() As Variant
    TypeOrder = Array("IntNum", "FloatNum", "ScientificNum", "PercentageNum", _
                      "CurrencyData", "DateData", "TimeData", "YearData", _
                      "EmailData", "Boolean", "Text")
End Function

' Cached compiled regexes (one VBScript.RegExp per pattern).
Private mInit As Boolean
Private reBoolean As Object
Private reEmail As Object
Private reScientific As Object
Private rePercent As Object
Private reCurrency As Object
Private reDateIso As Object
Private reDateSlash As Object
Private reDateDash As Object
Private reTime12 As Object
Private reTime24 As Object
Private reYear As Object
Private reFloat As Object
Private reInt As Object
Private reYearHeader As Object

Private Function MakeRe(ByVal pattern As String, ByVal ignoreCase As Boolean) As Object
    Dim re As Object
    Set re = CreateObject("VBScript.RegExp")
    re.Global = False
    re.IgnoreCase = ignoreCase
    re.MultiLine = False
    re.pattern = pattern
    Set MakeRe = re
End Function

Private Sub EnsureInit()
    If mInit Then Exit Sub
    ' Patterns copied verbatim from formatAggregation.ts (non-capturing (?:) in
    ' TS becomes plain capturing groups here -- VBScript supports both; the
    ' grouping is identical for a boolean .Test()).
    Set reBoolean = MakeRe("^(true|false)$", True)
    Set reEmail = MakeRe("^[^\s@]+@[^\s@]+\.[^\s@]+$", False)
    Set reScientific = MakeRe("^-?\d+(\.\d+)?[eE][+-]?\d+$", False)
    Set rePercent = MakeRe("^-?\d+(\.\d+)?%$", False)
    ' [$<U+20AC><U+00A3><U+00A5>] -- euro, pound, yen built via ChrW so the
    ' source file stays ASCII-clean and unambiguous.
    Set reCurrency = MakeRe("^-?[$" & ChrW(&H20AC) & ChrW(&HA3) & ChrW(&HA5) & "]\d+(\.\d+)?$", False)
    Set reDateIso = MakeRe("^\d{4}-\d{1,2}-\d{1,2}$", False)
    Set reDateSlash = MakeRe("^\d{1,2}/\d{1,2}/\d{2,4}$", False)
    Set reDateDash = MakeRe("^\d{1,2}-\d{1,2}-\d{2,4}$", False)
    Set reTime12 = MakeRe("^\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM|am|pm)$", False)
    Set reTime24 = MakeRe("^\d{1,2}:\d{2}(:\d{2})?$", False)
    Set reYear = MakeRe("^(19|20)\d{2}$", False)
    Set reFloat = MakeRe("^-?(\d+\.\d*|\.\d+)$", False)
    Set reInt = MakeRe("^-?\d+$", False)
    Set reYearHeader = MakeRe("\b(years?|yr|yyyy|fy|fiscal\s*years?)\b", True)
    mInit = True
End Sub

' SPEC sec.5.1: classify by VALUE ALONE. Returns "" for the empty string (the only
' empty value). A 1900-2099 4-digit value is "YearData" CANDIDATE here; context
' resolution happens in ResolveYear. Mirrors TS classify().
Public Function Classify(ByVal v As String) As String
    If v = "" Then
        Classify = ""
        Exit Function
    End If
    EnsureInit
    If reBoolean.Test(v) Then Classify = "Boolean": Exit Function
    If reEmail.Test(v) Then Classify = "EmailData": Exit Function
    If reScientific.Test(v) Then Classify = "ScientificNum": Exit Function
    If rePercent.Test(v) Then Classify = "PercentageNum": Exit Function
    If reCurrency.Test(v) Then Classify = "CurrencyData": Exit Function
    If reDateIso.Test(v) Or reDateSlash.Test(v) Or reDateDash.Test(v) Then
        Classify = "DateData": Exit Function
    End If
    If reTime12.Test(v) Or reTime24.Test(v) Then Classify = "TimeData": Exit Function
    If reYear.Test(v) Then Classify = "YearData": Exit Function
    If reFloat.Test(v) Then Classify = "FloatNum": Exit Function
    If reInt.Test(v) Then Classify = "IntNum": Exit Function
    Classify = "Text"
End Function

' SPEC sec.5.1.1 step 1: nearest non-empty cell ABOVE (r,c) in the same column that
' classifies as Text; else "" (no header). Mirrors TS nearestHeaderAbove() ->
' returns "" instead of null. Skips blanks and non-Text (numeric) cells.
Private Function NearestHeaderAbove(ByVal g As Grid, ByVal r As Long, ByVal c As Long) As String
    Dim rr As Long
    For rr = r - 1 To 0 Step -1
        Dim v As String
        v = g.CellAt(rr, c)
        If v <> "" Then
            If Classify(v) = "Text" Then
                NearestHeaderAbove = v
                Exit Function
            End If
        End If
    Next rr
    NearestHeaderAbove = ""
End Function

' SPEC sec.5.1.1: resolve a YearData candidate at (r,c) to "YearData" or "IntNum".
' Mirrors TS resolveYear(). NOTE the header test uses "" as the no-header
' sentinel -- but a present header could itself be ""? No: NearestHeaderAbove
' only returns Text-classified values, and "" never classifies as Text, so ""
' unambiguously means "no header". (TS distinguishes null from a string; here ""
' is safe because a real header is always a non-empty Text value.)
Private Function ResolveYear(ByVal g As Grid, ByVal r As Long, ByVal c As Long) As String
    Dim header As String
    header = NearestHeaderAbove(g, r, c)
    If header <> "" Then
        EnsureInit
        If reYearHeader.Test(header) Then
            ResolveYear = "YearData"
        Else
            ResolveYear = "IntNum"
        End If
        Exit Function
    End If

    Dim intSiblings As Long, yearSiblings As Long
    Dim rr As Long
    For rr = 0 To g.RowCount - 1
        If rr <> r Then
            Dim t As String
            t = Classify(g.CellAt(rr, c))
            If t = "YearData" Then
                intSiblings = intSiblings + 1
                yearSiblings = yearSiblings + 1
            ElseIf t = "IntNum" Then
                intSiblings = intSiblings + 1
            End If
        End If
    Next rr
    If intSiblings = 0 Then
        ResolveYear = "IntNum"
    ElseIf yearSiblings = intSiblings Then
        ResolveYear = "YearData"
    Else
        ResolveYear = "IntNum"
    End If
End Function

' SPEC sec.5: full encode. Mirrors encodings/formatAggregation.ts
' (aggregate + rectToRange + group emit). Returns an Encoding with TokenEstimate
' unset (ScCompress fills it after chart append).
Public Function EncodeFormatAggregation(ByVal g As Grid) As Encoding
    Dim enc As Encoding
    Set enc = New Encoding

    Dim numRows As Long, numCols As Long
    numRows = g.RowCount
    numCols = g.ColCount

    ' Empty grid -> empty string + groups:[].
    If numRows = 0 Or numCols = 0 Then
        enc.StringForm = ""
        enc.JsonForm = ScJson.SerializeFormatAggregation(g.OriginRow, g.OriginCol, New Collection)
        Set EncodeFormatAggregation = enc
        Exit Function
    End If

    ' Build the type map (value-level classify), then context-resolve YearData.
    Dim types() As String
    ReDim types(0 To numRows - 1, 0 To numCols - 1)
    Dim r As Long, c As Long
    For r = 0 To numRows - 1
        For c = 0 To numCols - 1
            types(r, c) = Classify(g.Cells(r, c))   ' "" for empty cells
        Next c
    Next r
    For r = 0 To numRows - 1
        For c = 0 To numCols - 1
            If types(r, c) = "YearData" Then types(r, c) = ResolveYear(g, r, c)
        Next c
    Next r

    ' Greedy rectangular merge (SPEC sec.5.2). claimed() defaults False.
    Dim claimed() As Boolean
    ReDim claimed(0 To numRows - 1, 0 To numCols - 1)

    ' Collect ranges per type into parallel arrays indexed by TypeOrder slot, so
    ' final emission is in canonical order regardless of discovery order.
    Dim order As Variant
    order = TypeOrder()
    Dim rangesByType(0 To 10) As Collection
    Dim ti As Long
    For ti = 0 To 10
        Set rangesByType(ti) = New Collection
    Next ti

    For r = 0 To numRows - 1
        For c = 0 To numCols - 1
            If Not claimed(r, c) Then
                Dim t As String
                t = types(r, c)
                If t <> "" Then            ' empty cells never aggregate (SPEC sec.5.1)
                    ' Extend right along row r.
                    Dim w As Long
                    w = 1
                    Do While (c + w < numCols)
                        If types(r, c + w) = t And Not claimed(r, c + w) Then
                            w = w + 1
                        Else
                            Exit Do
                        End If
                    Loop

                    ' Extend down: each candidate row fully same-type & unclaimed.
                    Dim h As Long
                    h = 1
                    Dim stop_ As Boolean
                    stop_ = False
                    Do While (r + h < numRows) And Not stop_
                        Dim cc As Long
                        For cc = c To c + w - 1
                            If types(r + h, cc) <> t Or claimed(r + h, cc) Then
                                stop_ = True
                                Exit For
                            End If
                        Next cc
                        If Not stop_ Then h = h + 1
                    Loop

                    Dim rr As Long
                    For rr = r To r + h - 1
                        For cc = c To c + w - 1
                            claimed(rr, cc) = True
                        Next cc
                    Next rr

                    Dim slot As Long
                    slot = TypeSlot(order, t)
                    rangesByType(slot).Add RectToRange(g, r, c, r + h - 1, c + w - 1)
                End If
            End If
        Next c
    Next r

    ' Emit groups in canonical type order, omitting empty groups.
    Dim groups As Collection
    Set groups = New Collection
    Dim strSb As StringBuilder
    Set strSb = New StringBuilder
    Dim firstGroup As Boolean
    firstGroup = True

    For ti = 0 To 10
        If rangesByType(ti).Count > 0 Then
            groups.Add Array(CStr(order(ti)), rangesByType(ti))
            If Not firstGroup Then strSb.Append vbLf
            strSb.Append CStr(order(ti)) & ": " & _
                ScEncodings.JoinCollection(rangesByType(ti), ",")
            firstGroup = False
        End If
    Next ti

    enc.StringForm = strSb.ToString()
    enc.JsonForm = ScJson.SerializeFormatAggregation(g.OriginRow, g.OriginCol, groups)
    Set EncodeFormatAggregation = enc
End Function

' SPEC sec.5.3 range syntax: single cell "B2"; rectangle "<tl>:<br>". Coords are
' grid-relative (r,c); offset by origin here. Mirrors TS rectToRange().
Private Function RectToRange(ByVal g As Grid, ByVal topRow As Long, ByVal leftCol As Long, _
                             ByVal bottomRow As Long, ByVal rightCol As Long) As String
    Dim topLeft As String
    topLeft = ScAddress.A1(g.OriginRow + topRow, g.OriginCol + leftCol)
    If topRow = bottomRow And leftCol = rightCol Then
        RectToRange = topLeft
    Else
        RectToRange = topLeft & ":" & _
            ScAddress.A1(g.OriginRow + bottomRow, g.OriginCol + rightCol)
    End If
End Function

Private Function TypeSlot(ByVal order As Variant, ByVal t As String) As Long
    Dim i As Long
    For i = LBound(order) To UBound(order)
        If order(i) = t Then
            TypeSlot = i
            Exit Function
        End If
    Next i
    TypeSlot = UBound(order)    ' should never happen; "Text" is last
End Function
