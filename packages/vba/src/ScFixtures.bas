Attribute VB_Name = "ScFixtures"
'@Folder("SheetCompressor.Harness")
' =====================================================================
' ScFixtures  --  build a Grid from a parsed input.json (SPEC sec.1 shape).
'
' Uses JsonConverter.ParseJson (Tim Hall VBA-JSON, MIT) for INPUT parsing ONLY.
' ParseJson returns a Dictionary for objects and a Collection for arrays. JSON
' string values come back as VBA Strings with escapes already decoded, which is
' exactly the raw cell text we want (so "\n" in the fixture becomes a real LF,
' matching what the TS reference feeds compress()).
'
' Padding to the max row length (SPEC sec.1: pad ragged rows to C with "") is done
' here so the core always sees a rectangle.
'
' NOTE: cellMeta is read if present (only dataType, SPEC sec.1); no corpus fixture
' currently uses it, but the path is implemented for parity + host glue.
' =====================================================================
Option Explicit

' Parse an input.json string and return a Grid.
Public Function GridFromInputJson(ByVal jsonText As String) As Grid
    Dim root As Object
    Set root = JsonConverter.ParseJson(jsonText)    ' Dictionary
    Set GridFromInputJson = GridFromDict(root)
End Function

Public Function GridFromDict(ByVal root As Object) As Grid
    Dim g As Grid
    Set g = New Grid

    ' origin
    Dim originRow As Long, originCol As Long
    originRow = 1: originCol = 1
    If root.Exists("origin") Then
        Dim org As Object
        Set org = root("origin")
        If org.Exists("row") Then originRow = CLng(org("row"))
        If org.Exists("col") Then originCol = CLng(org("col"))
    End If
    g.OriginRow = originRow
    g.OriginCol = originCol

    ' rows: Collection of Collection-of-String
    Dim rowsColl As Object
    Dim nR As Long, nC As Long
    nR = 0: nC = 0
    If root.Exists("rows") Then
        Set rowsColl = root("rows")
        nR = rowsColl.Count
        Dim i As Long
        For i = 1 To nR
            Dim rowColl As Object
            Set rowColl = rowsColl.Item(i)
            If rowColl.Count > nC Then nC = rowColl.Count
        Next i
    End If

    g.RowCount = nR
    g.ColCount = nC

    ' Preserve original ragged row lengths for the raw baseline (SPEC sec.7).
    If nR > 0 Then
        g.RowLenValid = True
        g.RedimRowLen nR
    End If

    If nR > 0 And nC > 0 Then
        g.RedimCells nR, nC
        Dim r As Long, c As Long
        For r = 0 To nR - 1
            Dim rc As Object
            Set rc = rowsColl.Item(r + 1)
            g.RowLen(r) = rc.Count
            For c = 0 To nC - 1
                If c < rc.Count Then
                    g.Cells(r, c) = AsCellString(rc.Item(c + 1))
                Else
                    g.Cells(r, c) = ""        ' SPEC sec.1: pad ragged trailing cells
                End If
            Next c
        Next r
    ElseIf nR > 0 Then
        ' nC = 0: every row is empty; record their (zero) lengths.
        For r = 0 To nR - 1
            g.RowLen(r) = rowsColl.Item(r + 1).Count
        Next r
    End If

    ' OPTIONAL cellMeta -> DataTypes (dataType only).
    If root.Exists("cellMeta") And nR > 0 And nC > 0 Then
        Dim metaColl As Object
        Set metaColl = root("cellMeta")
        g.HasDataTypes = True
        g.RedimDataTypes nR, nC
        For r = 0 To nR - 1
            g.DataTypes(r, 0) = ""    ' ensure allocated row even if meta short
            If r < metaColl.Count Then
                Dim metaRow As Object
                Set metaRow = metaColl.Item(r + 1)
                For c = 0 To nC - 1
                    Dim dt As String
                    dt = ""
                    If c < metaRow.Count Then
                        Dim cellMeta As Object
                        On Error Resume Next
                        Set cellMeta = metaRow.Item(c + 1)
                        On Error GoTo 0
                        If Not cellMeta Is Nothing Then
                            If cellMeta.Exists("dataType") Then dt = CStr(cellMeta("dataType"))
                        End If
                        Set cellMeta = Nothing
                    End If
                    g.DataTypes(r, c) = dt
                Next c
            Else
                For c = 0 To nC - 1
                    g.DataTypes(r, c) = ""
                Next c
            End If
        Next r
    End If

    ' OPTIONAL charts -> Collection of ChartDescriptor.
    If root.Exists("charts") Then
        Set g.Charts = ChartsFromColl(root("charts"))
    End If

    Set GridFromDict = g
End Function

' Build the charts Collection from a parsed JSON array.
Public Function ChartsFromColl(ByVal chartsColl As Object) As Collection
    Dim out As Collection
    Set out = New Collection
    If chartsColl Is Nothing Then
        Set ChartsFromColl = out
        Exit Function
    End If
    Dim i As Long
    For i = 1 To chartsColl.Count
        out.Add ChartFromDict(chartsColl.Item(i))
    Next i
    Set ChartsFromColl = out
End Function

Private Function ChartFromDict(ByVal d As Object) As ChartDescriptor
    Dim ch As ChartDescriptor
    Set ch = New ChartDescriptor
    If d.Exists("name") Then ch.Name = CStr(d("name"))
    If d.Exists("type") Then ch.ChartType = CStr(d("type"))
    If d.Exists("anchorRange") Then ch.AnchorRange = CStr(d("anchorRange"))

    If d.Exists("title") Then
        ch.HasTitle = True
        ch.Title = CStr(d("title"))
    End If

    If d.Exists("dataRanges") Then
        ch.HasData = True
        Set ch.DataRanges = StringCollFromArray(d("dataRanges"))
    End If

    If d.Exists("series") Then
        ch.HasSeries = True
        Set ch.Series = StringCollFromArray(d("series"))
    End If

    If d.Exists("axes") Then
        ch.HasAxes = True
        Dim ax As Object
        Set ax = d("axes")
        If ax.Exists("x") Then
            ch.HasXAxis = True
            ch.XAxis = CStr(ax("x"))
        End If
        If ax.Exists("y") Then
            ch.HasYAxis = True
            ch.YAxis = CStr(ax("y"))
        End If
    End If

    Set ChartFromDict = ch
End Function

Private Function StringCollFromArray(ByVal arr As Object) As Collection
    Dim out As Collection
    Set out = New Collection
    If arr Is Nothing Then
        Set StringCollFromArray = out
        Exit Function
    End If
    Dim i As Long
    For i = 1 To arr.Count
        out.Add CStr(arr.Item(i))
    Next i
    Set StringCollFromArray = out
End Function

' Coerce a parsed JSON scalar to the raw cell string. Fixture cells are JSON
' strings, so this is normally a no-op CStr. A JSON number/bool would be
' stringified (defensive; not expected in the corpus).
Private Function AsCellString(ByVal v As Variant) As String
    If IsNull(v) Then
        AsCellString = ""
    ElseIf VarType(v) = vbBoolean Then
        AsCellString = IIf(v, "true", "false")
    Else
        AsCellString = CStr(v)
    End If
End Function
