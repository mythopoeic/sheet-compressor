Attribute VB_Name = "ScEncodings"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScEncodings  --  the three v0 encodings + chart-token rendering.
'   * EncodeAnchor             mirrors encodings/anchor.ts            (SPEC sec.3)
'   * EncodeInvertedIndex      mirrors encodings/invertedIndex.ts     (SPEC sec.4)
'   * EncodeFormatAggregation  mirrors encodings/formatAggregation.ts (SPEC sec.5)
'   * RenderChartBlock / AppendChartBlock
'                              mirrors encodings/chartDescriptors.ts  (SPEC sec.6)
'
' Each Encode* returns an Encoding (.StringForm/.JsonForm) with TokenEstimate
' UNSET; ScCompress fills TokenEstimate after appending the chart block, exactly
' like TS withCharts() re-measures over the extended string.
' =====================================================================
Option Explicit

' Packing identical to TS invertedIndex.ts: row * 0x100000 + col. 0x100000 =
' 1048576 (Excel max rows). We pack into a Double (not a Long): a Long would
' overflow once an absolute row exceeds ~2047 (2^31 / 1048576), but a Double
' holds integers exactly up to 2^53, matching the TS reference's JS-number math.
Private Const PACK_STRIDE As Double = 1048576#    ' 0x100000

' ---------------------------------------------------------------------
' SPEC sec.3: structural-anchor skeleton.
' Emits a cell only where keptRows(r) AND keptCols(c) AND value <> "".
' Mirrors encodings/anchor.ts.
' ---------------------------------------------------------------------
Public Function EncodeAnchor(ByVal g As Grid, _
                             ByRef keptRows() As Boolean, _
                             ByRef keptCols() As Boolean) As Encoding
    Dim cells As Collection           ' of Array(address, rawValue) for JSON
    Set cells = New Collection
    Dim lineSb As StringBuilder
    Set lineSb = New StringBuilder
    Dim firstLine As Boolean
    firstLine = True

    Dim r As Long, c As Long
    For r = 0 To g.RowCount - 1
        If RowKept(keptRows, r) Then
            Dim tokSb As StringBuilder
            Set tokSb = New StringBuilder
            Dim anyTok As Boolean
            anyTok = False
            For c = 0 To g.ColCount - 1
                If ColKept(keptCols, c) Then
                    Dim value As String
                    value = g.Cells(r, c)
                    If value <> "" Then          ' SPEC sec.3.1: only literal "" is empty
                        Dim address As String
                        address = ScAddress.A1(g.OriginRow + r, g.OriginCol + c)
                        cells.Add Array(address, value)
                        If anyTok Then tokSb.Append "|"
                        tokSb.Append address & "," & ScEscape.EscapeValue(value)
                        anyTok = True
                    End If
                End If
            Next c
            ' SPEC sec.3.2: fully-empty rows are dropped (no blank line).
            If anyTok Then
                If Not firstLine Then lineSb.Append vbLf
                lineSb.Append tokSb.ToString()
                firstLine = False
            End If
        End If
    Next r

    Dim enc As Encoding
    Set enc = New Encoding
    enc.StringForm = lineSb.ToString()
    enc.JsonForm = ScJson.SerializeAnchor(g.OriginRow, g.OriginCol, cells)
    Set EncodeAnchor = enc
End Function

' ---------------------------------------------------------------------
' SPEC sec.4: inverted-index. Group non-empty cells by raw value (first-seen
' order), collapse each group into A1 rectangles via width-first greedy merge.
' Mirrors encodings/invertedIndex.ts.
' ---------------------------------------------------------------------
Public Function EncodeInvertedIndex(ByVal g As Grid) As Encoding
    ' Ordered value buckets. valueOrder holds distinct values in first-seen
    ' order; cellsByValueKeys maps "k:"&value -> Collection of packed coords.
    Dim valueOrder As Collection
    Set valueOrder = New Collection
    Dim buckets As Collection           ' parallel to valueOrder: each a Collection of Long
    Set buckets = New Collection
    Dim bucketIndex As Collection        ' "k:"&value -> Long (1-based index into valueOrder/buckets)
    Set bucketIndex = New Collection

    Dim r As Long, c As Long
    For r = 0 To g.RowCount - 1
        For c = 0 To g.ColCount - 1
            Dim value As String
            value = g.Cells(r, c)
            If value <> "" Then
                Dim key As String
                key = "k:" & value
                Dim idx As Long
                idx = LookupIndex(bucketIndex, key)
                Dim packed As Double
                packed = Pack(g.OriginRow + r, g.OriginCol + c)
                If idx = 0 Then
                    valueOrder.Add value
                    Dim newBucket As Collection
                    Set newBucket = New Collection
                    newBucket.Add packed
                    buckets.Add newBucket
                    bucketIndex.Add valueOrder.Count, key
                Else
                    buckets.Item(idx).Add packed
                End If
            End If
        Next c
    Next r

    ' Build JSON groups + string form in first-seen value order.
    Dim groups As Collection            ' of Array(value, rangesCollection)
    Set groups = New Collection
    Dim strSb As StringBuilder
    Set strSb = New StringBuilder
    Dim firstGroup As Boolean
    firstGroup = True

    Dim gi As Long
    For gi = 1 To valueOrder.Count
        Dim val As String
        val = valueOrder.Item(gi)
        Dim cellKeys As Collection
        Set cellKeys = buckets.Item(gi)
        Dim ranges As Collection
        Set ranges = MergeRanges(cellKeys)

        groups.Add Array(val, ranges)

        ' string form: <range1>|...|<rangeN>,<escaped-value>
        If Not firstGroup Then strSb.Append vbLf
        strSb.Append JoinCollection(ranges, "|") & "," & ScEscape.EscapeValue(val)
        firstGroup = False
    Next gi

    Dim enc As Encoding
    Set enc = New Encoding
    enc.StringForm = strSb.ToString()
    enc.JsonForm = ScJson.SerializeInvertedIndex(g.OriginRow, g.OriginCol, groups)
    Set EncodeInvertedIndex = enc
End Function

' Width-first greedy rectangle merge for one value's cell set (SPEC sec.4.2).
' cellKeys is a Collection of packed coords in row-major insertion order.
' Mirrors the inner loop of encodings/invertedIndex.ts. Returns a Collection of
' range strings (single cell "A1", or "A1:C5").
Private Function MergeRanges(ByVal cellKeys As Collection) As Collection
    ' present-set and assigned-set keyed by packed coord (string key off a Double).
    Dim present As Collection, assigned As Collection
    Set present = New Collection
    Set assigned = New Collection

    Dim i As Long
    For i = 1 To cellKeys.Count
        ' guard against duplicate packed coords (can't happen: one cell, one value)
        If Not HasLongKey(present, CDbl(cellKeys.Item(i))) Then
            present.Add True, LongKey(CDbl(cellKeys.Item(i)))
        End If
    Next i

    Dim ranges As Collection
    Set ranges = New Collection

    For i = 1 To cellKeys.Count
        Dim startKey As Double
        startKey = CDbl(cellKeys.Item(i))
        If Not HasLongKey(assigned, startKey) Then
            Dim startRow As Long, startCol As Long
            startRow = CLng(Int(startKey / PACK_STRIDE))
            startCol = CLng(startKey - CDbl(startRow) * PACK_STRIDE)

            ' Maximum width: extend right while in present-set AND unassigned.
            Dim width As Long
            width = 1
            Do While InSet(present, Pack(startRow, startCol + width)) _
                 And Not HasLongKey(assigned, Pack(startRow, startCol + width))
                width = width + 1
            Loop

            ' Maximum height: extend down while every cell of the width-row is
            ' present and unassigned.
            Dim height As Long
            height = 1
            Dim canExtend As Boolean
            Do
                Dim nextRow As Long
                nextRow = startRow + height
                canExtend = True
                Dim dc As Long
                For dc = 0 To width - 1
                    Dim kk As Double
                    kk = Pack(nextRow, startCol + dc)
                    If (Not InSet(present, kk)) Or HasLongKey(assigned, kk) Then
                        canExtend = False
                        Exit For
                    End If
                Next dc
                If Not canExtend Then Exit Do
                height = height + 1
            Loop

            Dim dr As Long
            For dr = 0 To height - 1
                For dc = 0 To width - 1
                    Dim ak As Double
                    ak = Pack(startRow + dr, startCol + dc)
                    If Not HasLongKey(assigned, ak) Then assigned.Add True, LongKey(ak)
                Next dc
            Next dr

            Dim topLeft As String
            topLeft = ScAddress.A1(startRow, startCol)
            If width = 1 And height = 1 Then
                ranges.Add topLeft
            Else
                ranges.Add topLeft & ":" & _
                    ScAddress.A1(startRow + height - 1, startCol + width - 1)
            End If
        End If
    Next i

    Set MergeRanges = ranges
End Function

' ---------------------------------------------------------------------
' SPEC sec.6: chart-token rendering.  Mirrors encodings/chartDescriptors.ts.
' ---------------------------------------------------------------------

' Render a single descriptor to the SPEC sec.6.1 token form. Field order fixed:
' anchorRange, title, data, series, xAxis, yAxis. Optional fields omitted when
' absent / empty array.
Public Function RenderChartToken(ByVal chart As ChartDescriptor) As String
    Dim parts As Collection
    Set parts = New Collection
    parts.Add "CHART(" & chart.ChartType & ")@" & chart.AnchorRange

    If chart.HasTitle Then
        parts.Add "title=""" & ScEscape.EscapeQuoted(chart.Title) & """"
    End If
    If chart.HasData Then
        If chart.DataRanges.Count > 0 Then
            parts.Add "data=" & JoinCollection(chart.DataRanges, ",")
        End If
    End If
    If chart.HasSeries Then
        If chart.Series.Count > 0 Then
            parts.Add "series=[" & JoinEscapedSeries(chart.Series) & "]"
        End If
    End If
    If chart.HasXAxis Then
        parts.Add "xAxis=""" & ScEscape.EscapeQuoted(chart.XAxis) & """"
    End If
    If chart.HasYAxis Then
        parts.Add "yAxis=""" & ScEscape.EscapeQuoted(chart.YAxis) & """"
    End If

    RenderChartToken = JoinCollection(parts, " ")
End Function

' SPEC sec.6.2: tokens joined by vbLf in input order, no trailing newline.
' "" when charts is Nothing/empty.
Public Function RenderChartBlock(ByVal charts As Collection) As String
    If charts Is Nothing Or charts.Count = 0 Then
        RenderChartBlock = ""
        Exit Function
    End If
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    Dim i As Long
    For i = 1 To charts.Count
        If i > 1 Then sb.Append vbLf
        sb.Append RenderChartToken(charts.Item(i))
    Next i
    RenderChartBlock = sb.ToString()
End Function

' SPEC sec.6.2: append chart block with the documented separator rule.
Public Function AppendChartBlock(ByVal cellString As String, ByVal chartBlock As String) As String
    If chartBlock = "" Then
        AppendChartBlock = cellString
    ElseIf cellString = "" Then
        AppendChartBlock = chartBlock
    Else
        AppendChartBlock = cellString & vbLf & chartBlock
    End If
End Function

' ---- small collection / set helpers ---------------------------------

' Pack into a Double (exact for integers to 2^53). row * 1048576 + col.
Private Function Pack(ByVal row As Long, ByVal col As Long) As Double
    Pack = CDbl(row) * PACK_STRIDE + CDbl(col)
End Function

' String key off the packed Double. CStr of a whole-number Double yields its
' decimal digits with no exponent for values in this range, giving a stable key.
Private Function LongKey(ByVal v As Double) As String
    LongKey = "p:" & Format$(v, "0")
End Function

Private Function HasLongKey(ByVal coll As Collection, ByVal v As Double) As Boolean
    Dim tmp As Variant
    On Error GoTo nf
    tmp = coll.Item(LongKey(v))
    HasLongKey = True
    Exit Function
nf:
    HasLongKey = False
End Function

Private Function InSet(ByVal coll As Collection, ByVal v As Double) As Boolean
    InSet = HasLongKey(coll, v)
End Function

' Returns 1-based index stored under key, or 0 if absent.
Private Function LookupIndex(ByVal idxColl As Collection, ByVal key As String) As Long
    Dim tmp As Variant
    On Error GoTo nf
    tmp = idxColl.Item(key)
    LookupIndex = CLng(tmp)
    Exit Function
nf:
    LookupIndex = 0
End Function

Private Function RowKept(ByRef keptRows() As Boolean, ByVal r As Long) As Boolean
    On Error GoTo nf
    RowKept = keptRows(r)
    Exit Function
nf:
    RowKept = False
End Function

Private Function ColKept(ByRef keptCols() As Boolean, ByVal c As Long) As Boolean
    On Error GoTo nf
    ColKept = keptCols(c)
    Exit Function
nf:
    ColKept = False
End Function

Public Function JoinCollection(ByVal coll As Collection, ByVal sep As String) As String
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    Dim i As Long
    For i = 1 To coll.Count
        If i > 1 Then sb.Append sep
        sb.Append CStr(coll.Item(i))
    Next i
    JoinCollection = sb.ToString()
End Function

Private Function JoinEscapedSeries(ByVal coll As Collection) As String
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    Dim i As Long
    For i = 1 To coll.Count
        If i > 1 Then sb.Append ","
        sb.Append ScEscape.EscapeSeriesName(CStr(coll.Item(i)))
    Next i
    JoinEscapedSeries = sb.ToString()
End Function
