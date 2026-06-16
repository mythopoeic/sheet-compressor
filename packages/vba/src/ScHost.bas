Attribute VB_Name = "ScHost"
'@Folder("SheetCompressor.Host")
' =====================================================================
' ScHost  --  Excel host glue. The ONLY module that touches Excel objects.
' Keep the pure core (ScAddress/ScEscape/ScTokens/ScStrategy/ScEncodings/
' ScFormatAgg/ScJson/ScCompress + the *.cls) free of these dependencies.
'
'   GridFromUsedRange     : ActiveSheet/any Worksheet .UsedRange -> Grid, with
'                           origin taken from the range's top-left (SPEC sec.8.1:
'                           origin is NOT always A1).
'   AttachChartObjects    : ChartObjects metadata -> ChartDescriptor list
'                           (SPEC sec.6 / sec.8.1), best-effort fields.
'   ExportChartBase64     : OPTIONAL Chart.Export -> base64 (PNG).
'   File I/O helpers (UTF-8, LF-preserving) used by the conformance harness.
' =====================================================================
Option Explicit

' --- Grid from a worksheet's used range ------------------------------
' Reads cell TEXT as the model would see it. We use .Text so the Grid carries
' the displayed string (matching how a user reads the sheet); switch to .Value2
' + formatting if you need raw values. Origin = used range's first row/column.
'
' Single-cell used ranges and truly empty sheets are handled (Excel always
' returns at least A1 for UsedRange on a blank sheet).
Public Function GridFromUsedRange(ByVal ws As Object) As Grid
    Dim ur As Object
    Set ur = ws.UsedRange

    Dim originRow As Long, originCol As Long
    originRow = ur.Row
    originCol = ur.Column

    Dim nR As Long, nC As Long
    nR = ur.Rows.Count
    nC = ur.Columns.Count

    Dim g As Grid
    Set g = New Grid
    g.OriginRow = originRow
    g.OriginCol = originCol
    g.RowCount = nR
    g.ColCount = nC

    If nR > 0 And nC > 0 Then
        g.RedimCells nR, nC

        ' Read .Text for every cell. (Reading cell-by-cell is simplest and
        ' robust for single-cell ranges; for very large ranges a bulk .Value2
        ' read could be added, but .Text per cell matches the displayed string.)
        Dim r As Long, c As Long
        For r = 1 To nR
            For c = 1 To nC
                Dim cellTxt As String
                cellTxt = CStr(ur.Cells(r, c).Text)
                g.Cells(r - 1, c - 1) = cellTxt
            Next c
        Next r

        ' Populate declared dataType per cell (SPEC sec.1 / sec.8.1).
        g.HasDataTypes = True
        g.RedimDataTypes nR, nC
        For r = 1 To nR
            For c = 1 To nC
                g.DataTypes(r - 1, c - 1) = DataTypeOfCell(ur.Cells(r, c))
            Next c
        Next r
    End If

    ' Charts on the sheet.
    On Error Resume Next
    AttachChartObjects ws, g
    On Error GoTo 0

    Set GridFromUsedRange = g
End Function

' Map an Excel cell to a SPEC dataType string. A formula collapses to "formula"
' regardless of evaluated type (SPEC sec.8.1). Empty cell -> "empty".
Private Function DataTypeOfCell(ByVal cell As Object) As String
    On Error Resume Next
    If cell.HasFormula Then
        DataTypeOfCell = "formula"
        Exit Function
    End If
    Dim v As Variant
    v = cell.Value2
    If IsEmpty(v) Then
        DataTypeOfCell = "empty"
    ElseIf IsError(v) Then
        DataTypeOfCell = "error"
    ElseIf VarType(v) = vbBoolean Then
        DataTypeOfCell = "bool"
    ElseIf IsNumeric(v) Then
        ' Distinguish dates from plain numbers via the cell's number format.
        If IsDateFormatted(cell) Then
            DataTypeOfCell = "date"
        Else
            DataTypeOfCell = "number"
        End If
    Else
        DataTypeOfCell = "text"
    End If
    On Error GoTo 0
End Function

Private Function IsDateFormatted(ByVal cell As Object) As Boolean
    Dim nf As String
    nf = LCase$(CStr(cell.NumberFormat))
    IsDateFormatted = (InStr(nf, "y") > 0 Or InStr(nf, "d") > 0 Or InStr(nf, "m") > 0) _
                      And InStr(nf, "general") = 0
End Function

' --- ChartObjects -> ChartDescriptor list ----------------------------
' Best-effort metadata extraction (SPEC sec.8.1 allows partial descriptors).
' anchorRange is derived from the chart's TopLeftCell:BottomRightCell.
Public Sub AttachChartObjects(ByVal ws As Object, ByVal g As Grid)
    If g.Charts Is Nothing Then Set g.Charts = New Collection
    Dim co As Object
    For Each co In ws.ChartObjects
        Dim ch As ChartDescriptor
        Set ch = New ChartDescriptor
        ch.Name = CStr(co.Name)
        ch.ChartType = MapChartType(co.Chart)
        ch.AnchorRange = ChartAnchorRange(co)

        On Error Resume Next
        If co.Chart.HasTitle Then
            ch.HasTitle = True
            ch.Title = CStr(co.Chart.ChartTitle.Text)
        End If
        On Error GoTo 0

        g.Charts.Add ch
    Next co
End Sub

' Map Excel xlChartType to the SPEC type vocabulary. Coarse buckets; unknown
' families -> "other".
Private Function MapChartType(ByVal cht As Object) As String
    Dim t As Long
    On Error Resume Next
    t = cht.ChartType
    On Error GoTo 0
    Select Case t
        ' xlColumnClustered=51..xlBarStacked etc. -> "bar"
        Case 51, 52, 53, 54, 57, 58, 60, 61, 291, 292, 293
            MapChartType = "bar"
        Case 4, 65, 66, 63, 64        ' xlLine families
            MapChartType = "line"
        Case 5, -4120, 68, 69, 70     ' xlPie / xlPieOfPie / doughnut-ish
            MapChartType = "pie"
        Case -4169, 72, 73, 74, 75    ' xlXYScatter families
            MapChartType = "scatter"
        Case 1, 76, 77, 78, 79        ' xlArea families
            MapChartType = "area"
        Case Else
            MapChartType = "other"
    End Select
End Function

Private Function ChartAnchorRange(ByVal co As Object) As String
    Dim tl As Object, br As Object
    On Error GoTo fallback
    Set tl = co.TopLeftCell
    Set br = co.BottomRightCell
    ChartAnchorRange = ScAddress.A1(tl.Row, tl.Column) & ":" & ScAddress.A1(br.Row, br.Column)
    Exit Function
fallback:
    ChartAnchorRange = ""
End Function

' --- OPTIONAL: export a chart picture as base64 (PNG) -----------------
' Writes the chart to a temp PNG via Chart.Export, then base64-encodes the bytes.
' Returns "" on any failure. Not part of conformance; provided per the PRD's
' "optional base64 chart render".
Public Function ExportChartBase64(ByVal co As Object) As String
    Dim tmp As String
    tmp = Environ$("TEMP") & "\sc_chart_" & Format$(Now, "yyyymmddhhnnss") & "_" & Int(Rnd * 100000) & ".png"
    On Error GoTo fail
    co.Chart.Export Filename:=tmp, FilterName:="PNG"
    ExportChartBase64 = Base64EncodeFile(tmp)
    On Error Resume Next
    Kill tmp
    Exit Function
fail:
    ExportChartBase64 = ""
End Function

Private Function Base64EncodeFile(ByVal path As String) As String
    Dim stm As Object, xml As Object, node As Object
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 1                 ' binary
    stm.Open
    stm.LoadFromFile path
    Dim bytes() As Byte
    bytes = stm.Read
    stm.Close

    Set xml = CreateObject("MSXML2.DOMDocument")
    Set node = xml.createElement("b64")
    node.DataType = "bin.base64"
    node.nodeTypedValue = bytes
    Base64EncodeFile = node.Text
End Function

' --- UTF-8 / LF file I/O (used by the conformance harness) -----------
' ReadUtf8File: read a file as UTF-8 text. CR/LF bytes pass through verbatim, so
' a golden's LF-only line endings are preserved exactly for byte comparison.
Public Function ReadUtf8File(ByVal path As String) As String
    Dim stm As Object
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2                 ' text
    stm.Charset = "utf-8"
    stm.Open
    stm.LoadFromFile path
    ReadUtf8File = stm.ReadText(-1)   ' adReadAll
    stm.Close
End Function

' WriteUtf8File: write text as UTF-8 with NO BOM. ADODB.Stream prepends a BOM for
' utf-8; we strip the leading 3 bytes by copying through a binary stream.
Public Sub WriteUtf8File(ByVal path As String, ByVal text As String)
    Dim stm As Object
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2
    stm.Charset = "utf-8"
    stm.Open
    stm.WriteText text
    ' Strip BOM: re-read as binary, skip first 3 bytes, save.
    stm.Position = 0
    stm.Type = 1                 ' switch to binary
    stm.Position = 3             ' skip UTF-8 BOM
    Dim rest() As Byte
    rest = stm.Read
    stm.Close

    Dim outStm As Object
    Set outStm = CreateObject("ADODB.Stream")
    outStm.Type = 1
    outStm.Open
    outStm.Write rest
    outStm.SaveToFile path, 2    ' adSaveCreateOverWrite
    outStm.Close
End Sub
