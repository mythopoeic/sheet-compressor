Attribute VB_Name = "ScJson"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScJson  --  canonical JSON serializer matching the golden corpus BYTE-FOR-BYTE.
' Mirrors packages/csharp/src/SheetCompressor/Json/CanonicalJson.cs and the
' SPEC sec.3.3 / sec.4.5 / sec.5.4 / sec.6.2 contract:
'
'   * 2-space indentation
'   * LF (vbLf) line endings -- never CRLF
'   * fixed key order exactly as the SPEC types list them
'   * trailing newline at end of document
'   * UTF-8 literal output: non-ASCII chars pass through verbatim, NEVER
'     \uXXXX-escaped. The serializer only emits the structural escapes
'     ( \" \\ \b \f \n \r \t and \u00XX for other C0 controls).
'   * empty arrays render as "[]" (no inner newlines).
'
' IMPORTANT: do NOT use JsonConverter.ConvertToJson for OUTPUT -- its formatting
' (key order, number rendering, escaping) does not match the goldens. We hand-
' build the exact byte stream here. JsonConverter is used for INPUT parsing only.
'
' Output is a VBA String (UTF-16 in memory). Writing it to disk as UTF-8 (no BOM)
' is the harness/host's job (see ScHarness.WriteUtf8File).
' =====================================================================
Option Explicit

' --- low-level: append a JSON-escaped string literal (incl. surrounding quotes)
' Mirrors C# WriteJsonString. Iterates UTF-16 code units; chars >= 0x20 (other
' than " and \) pass through verbatim so non-ASCII stays literal (SPEC sec.3.3).
Public Sub AppendJsonString(ByRef sb As StringBuilder, ByVal value As String)
    sb.Append """"
    Dim i As Long, code As Long, ch As String
    For i = 1 To Len(value)
        ch = Mid$(value, i, 1)
        code = AscW(ch) And &HFFFF&     ' AscW can return negative for >0x7FFF; mask to 0..65535
        Select Case code
            Case 34         ' "
                sb.Append "\"""
            Case 92         ' \
                sb.Append "\\"
            Case 8          ' backspace
                sb.Append "\b"
            Case 12         ' form feed
                sb.Append "\f"
            Case 10         ' \n
                sb.Append "\n"
            Case 13         ' \r
                sb.Append "\r"
            Case 9          ' \t
                sb.Append "\t"
            Case Else
                If code < &H20& Then
                    sb.Append "\u" & LCase$(Right$("000" & Hex$(code), 4))
                Else
                    sb.Append ch        ' verbatim, including all non-ASCII
                End If
        End Select
    Next i
    sb.Append """"
End Sub

' origin object at the given base indent. Mirrors C# WriteOrigin.
Private Sub AppendOrigin(ByRef sb As StringBuilder, ByVal originRow As Long, _
                         ByVal originCol As Long, ByVal indent As String)
    Dim inner As String
    inner = indent & "  "
    sb.Append "{" & vbLf
    sb.Append inner & """row"": " & CStr(originRow) & "," & vbLf
    sb.Append inner & """col"": " & CStr(originCol) & vbLf
    sb.Append indent & "}"
End Sub

' string array at the given base indent. Empty -> "[]". Mirrors C# WriteStringArray.
Private Sub AppendStringArray(ByRef sb As StringBuilder, ByVal values As Collection, _
                              ByVal indent As String)
    If values Is Nothing Or values.Count = 0 Then
        sb.Append "[]"
        Exit Sub
    End If
    sb.Append "[" & vbLf
    Dim inner As String
    inner = indent & "  "
    Dim i As Long
    For i = 1 To values.Count
        sb.Append inner
        AppendJsonString sb, CStr(values.Item(i))
        If i < values.Count Then sb.Append ","
        sb.Append vbLf
    Next i
    sb.Append indent & "]"
End Sub

' === Anchor JSON (SPEC sec.3.3) =========================================
' cells is a Collection of 2-element arrays Array(address, value).
Public Function SerializeAnchor(ByVal originRow As Long, ByVal originCol As Long, _
                                ByVal cells As Collection) As String
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    sb.Append "{" & vbLf
    sb.Append "  ""encoding"": "
    AppendJsonString sb, "anchor-skeleton"
    sb.Append "," & vbLf
    sb.Append "  ""version"": 0," & vbLf
    sb.Append "  ""origin"": "
    AppendOrigin sb, originRow, originCol, "  "
    sb.Append "," & vbLf
    sb.Append "  ""cells"": "
    If cells Is Nothing Or cells.Count = 0 Then
        sb.Append "[]"
    Else
        sb.Append "[" & vbLf
        Dim i As Long
        For i = 1 To cells.Count
            Dim cell As Variant
            cell = cells.Item(i)            ' Array(address, value)
            sb.Append "    {" & vbLf
            sb.Append "      ""address"": "
            AppendJsonString sb, CStr(cell(0))
            sb.Append "," & vbLf
            sb.Append "      ""value"": "
            AppendJsonString sb, CStr(cell(1))
            sb.Append vbLf
            sb.Append "    }"
            If i < cells.Count Then sb.Append ","
            sb.Append vbLf
        Next i
        sb.Append "  ]"
    End If
    sb.Append vbLf
    sb.Append "}" & vbLf
    SerializeAnchor = sb.ToString()
End Function

' === Inverted-index JSON (SPEC sec.4.5) =================================
' groups is a Collection of 2-element arrays Array(value, rangesCollection).
Public Function SerializeInvertedIndex(ByVal originRow As Long, ByVal originCol As Long, _
                                       ByVal groups As Collection) As String
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    sb.Append "{" & vbLf
    sb.Append "  ""encoding"": "
    AppendJsonString sb, "inverted-index"
    sb.Append "," & vbLf
    sb.Append "  ""version"": 0," & vbLf
    sb.Append "  ""origin"": "
    AppendOrigin sb, originRow, originCol, "  "
    sb.Append "," & vbLf
    sb.Append "  ""groups"": "
    If groups Is Nothing Or groups.Count = 0 Then
        sb.Append "[]"
    Else
        sb.Append "[" & vbLf
        Dim i As Long
        For i = 1 To groups.Count
            Dim grp As Variant
            grp = groups.Item(i)            ' Array(value, rangesCollection)
            sb.Append "    {" & vbLf
            sb.Append "      ""value"": "
            AppendJsonString sb, CStr(grp(0))
            sb.Append "," & vbLf
            sb.Append "      ""ranges"": "
            AppendStringArray sb, grp(1), "      "
            sb.Append vbLf
            sb.Append "    }"
            If i < groups.Count Then sb.Append ","
            sb.Append vbLf
        Next i
        sb.Append "  ]"
    End If
    sb.Append vbLf
    sb.Append "}" & vbLf
    SerializeInvertedIndex = sb.ToString()
End Function

' === Format-aggregation JSON (SPEC sec.5.4) =============================
' groups is a Collection of 2-element arrays Array(typeName, rangesCollection).
Public Function SerializeFormatAggregation(ByVal originRow As Long, ByVal originCol As Long, _
                                           ByVal groups As Collection) As String
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    sb.Append "{" & vbLf
    sb.Append "  ""encoding"": "
    AppendJsonString sb, "format-aggregation"
    sb.Append "," & vbLf
    sb.Append "  ""version"": 0," & vbLf
    sb.Append "  ""origin"": "
    AppendOrigin sb, originRow, originCol, "  "
    sb.Append "," & vbLf
    sb.Append "  ""groups"": "
    If groups Is Nothing Or groups.Count = 0 Then
        sb.Append "[]"
    Else
        sb.Append "[" & vbLf
        Dim i As Long
        For i = 1 To groups.Count
            Dim grp As Variant
            grp = groups.Item(i)            ' Array(typeName, rangesCollection)
            sb.Append "    {" & vbLf
            sb.Append "      ""type"": "
            AppendJsonString sb, CStr(grp(0))
            sb.Append "," & vbLf
            sb.Append "      ""ranges"": "
            AppendStringArray sb, grp(1), "      "
            sb.Append vbLf
            sb.Append "    }"
            If i < groups.Count Then sb.Append ","
            sb.Append vbLf
        Next i
        sb.Append "  ]"
    End If
    sb.Append vbLf
    sb.Append "}" & vbLf
    SerializeFormatAggregation = sb.ToString()
End Function

' === charts.json (SPEC sec.6.2 echo) ====================================
' charts is a Collection of ChartDescriptor. Key order per the SPEC type:
' name, type, anchorRange, title?, dataRanges?, series?, axes? (x?, y?).
Public Function SerializeCharts(ByVal charts As Collection) As String
    Dim sb As StringBuilder
    Set sb = New StringBuilder
    If charts Is Nothing Or charts.Count = 0 Then
        sb.Append "[]" & vbLf
        SerializeCharts = sb.ToString()
        Exit Function
    End If
    sb.Append "[" & vbLf
    Dim i As Long
    For i = 1 To charts.Count
        AppendChart sb, charts.Item(i), "  "
        If i < charts.Count Then sb.Append ","
        sb.Append vbLf
    Next i
    sb.Append "]" & vbLf
    SerializeCharts = sb.ToString()
End Function

' Mirrors C# WriteChart: emits only the fields that are present (Has* flags /
' non-Nothing arrays), in fixed key order, comma-separating written fields.
Private Sub AppendChart(ByRef sb As StringBuilder, ByVal chart As ChartDescriptor, _
                        ByVal indent As String)
    Dim inner As String
    inner = indent & "  "
    Dim written As Boolean
    written = False

    sb.Append indent & "{" & vbLf

    AppendChartField sb, inner, "name", chart.Name, written
    AppendChartField sb, inner, "type", chart.ChartType, written
    AppendChartField sb, inner, "anchorRange", chart.AnchorRange, written

    If chart.HasTitle Then
        AppendChartField sb, inner, "title", chart.Title, written
    End If

    If chart.HasData Then
        FinishPrev sb, written
        sb.Append inner & """dataRanges"": "
        AppendStringArray sb, chart.DataRanges, inner
        written = True
    End If

    If chart.HasSeries Then
        FinishPrev sb, written
        sb.Append inner & """series"": "
        AppendStringArray sb, chart.Series, inner
        written = True
    End If

    If chart.HasAxes Then
        FinishPrev sb, written
        sb.Append inner & """axes"": {"
        Dim axisInner As String
        axisInner = inner & "  "
        Dim axisWritten As Boolean
        axisWritten = False
        If chart.HasXAxis Then
            sb.Append vbLf
            AppendChartField sb, axisInner, "x", chart.XAxis, axisWritten
        End If
        If chart.HasYAxis Then
            If axisWritten Then
                sb.Append "," & vbLf
            Else
                sb.Append vbLf
            End If
            sb.Append axisInner & """y"": "
            AppendJsonString sb, chart.YAxis
            axisWritten = True
        End If
        If axisWritten Then
            sb.Append vbLf & inner & "}"
        Else
            sb.Append "}"
        End If
        written = True
    End If

    sb.Append vbLf & indent & "}"
End Sub

Private Sub FinishPrev(ByRef sb As StringBuilder, ByRef written As Boolean)
    If written Then sb.Append "," & vbLf
End Sub

Private Sub AppendChartField(ByRef sb As StringBuilder, ByVal indent As String, _
                             ByVal name As String, ByVal value As String, _
                             ByRef written As Boolean)
    FinishPrev sb, written
    sb.Append indent & """" & name & """: "
    AppendJsonString sb, value
    written = True
End Sub
