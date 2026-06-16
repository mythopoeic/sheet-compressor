Attribute VB_Name = "ScStrategy"
'@Folder("SheetCompressor.Core")
' =====================================================================
' ScStrategy  --  anchor-detection strategies (SPEC sec.3.1).
' Mirrors packages/typescript/src/strategies.ts
'   - keepAllStrategy   (SPEC sec.3.1.1)
'   - phase1Strategy    (SPEC sec.3.1.2, the DEFAULT)
'
' A "detection" is returned as two Boolean arrays via ByRef out-params:
'   keptRows(0..RowCount-1), keptCols(0..ColCount-1)
' True == kept. This is the VBA stand-in for the TS ReadonlySet<number> pair.
' The anchor encoder emits a cell only where keptRows(r) AND keptCols(c).
'
' Type inference & heterogeneity use ONLY grid contents + declared dataType,
' never style flags (Phase-2 reserved).  k = 4, het threshold = 0.5 (SPEC sec.3.1).
' =====================================================================
Option Explicit

Private Const PHASE1_K As Long = 4
Private Const PHASE1_HET_THRESHOLD As Double = 0.5

' Dispatch by built-in name. Unknown name -> phase1 (the default). Mirrors TS
' resolveStrategy(): undefined/unknown -> phase1.
Public Sub Detect(ByVal g As Grid, ByVal strategyName As String, _
                  ByRef keptRows() As Boolean, ByRef keptCols() As Boolean)
    If LCase$(strategyName) = "keep-all" Then
        DetectKeepAll g, keptRows, keptCols
    Else
        DetectPhase1 g, keptRows, keptCols
    End If
End Sub

' SPEC sec.3.1.1: keep every row index [0,RowCount) and col index [0,ColCount).
Public Sub DetectKeepAll(ByVal g As Grid, _
                         ByRef keptRows() As Boolean, ByRef keptCols() As Boolean)
    AllocFalse keptRows, g.RowCount
    AllocFalse keptCols, g.ColCount
    Dim i As Long
    For i = 0 To g.RowCount - 1
        keptRows(i) = True
    Next i
    For i = 0 To g.ColCount - 1
        keptCols(i) = True
    Next i
End Sub

' SPEC sec.3.1.2 phase1. Mirrors TS phase1Strategy.detect() step-for-step.
Public Sub DetectPhase1(ByVal g As Grid, _
                        ByRef keptRows() As Boolean, ByRef keptCols() As Boolean)
    Dim nR As Long, nC As Long
    nR = g.RowCount
    nC = g.ColCount

    AllocFalse keptRows, nR
    AllocFalse keptCols, nC
    If nR = 0 Or nC = 0 Then Exit Sub      ' empty grid -> empty detection

    ' --- anchorRows / anchorCols as Boolean arrays --------------------
    Dim anchorRows() As Boolean, anchorCols() As Boolean
    AllocFalse anchorRows, nR
    AllocFalse anchorCols, nC

    Dim r As Long, c As Long

    ' 1a. Heterogeneity anchors, row-wise: H(r) = unique/nonEmpty >= 0.5
    For r = 0 To nR - 1
        Dim rowVals() As String
        ReDim rowVals(0 To nC - 1)
        For c = 0 To nC - 1
            rowVals(c) = g.CellAt(r, c)
        Next c
        If Heterogeneity(rowVals) >= PHASE1_HET_THRESHOLD Then anchorRows(r) = True
    Next r

    ' 1b. Type-transition anchors, row-wise: adjacent rows differ in any column.
    For r = 1 To nR - 1
        If RowTypesDiffer(g, r - 1, r, nC) Then
            anchorRows(r - 1) = True
            anchorRows(r) = True
        End If
    Next r

    ' Heterogeneity anchors, column-wise.
    For c = 0 To nC - 1
        Dim colVals() As String
        ReDim colVals(0 To nR - 1)
        For r = 0 To nR - 1
            colVals(r) = g.CellAt(r, c)
        Next r
        If Heterogeneity(colVals) >= PHASE1_HET_THRESHOLD Then anchorCols(c) = True
    Next c

    ' Type-transition anchors, column-wise.
    For c = 1 To nC - 1
        If ColTypesDiffer(g, c - 1, c, nR) Then
            anchorCols(c - 1) = True
            anchorCols(c) = True
        End If
    Next c

    ' 3. K-neighborhood expansion -> keptRows / keptCols.
    ExpandNeighborhood anchorRows, nR, PHASE1_K, keptRows
    ExpandNeighborhood anchorCols, nC, PHASE1_K, keptCols

    ' 4. Prune entirely-blank rows/cols within the kept region. Rows first,
    '    THEN columns (single pass; columns see the already-updated keptRows).
    For r = 0 To nR - 1
        If keptRows(r) Then
            Dim hasContent As Boolean
            hasContent = False
            For c = 0 To nC - 1
                If keptCols(c) Then
                    If g.CellAt(r, c) <> "" Then
                        hasContent = True
                        Exit For
                    End If
                End If
            Next c
            If Not hasContent Then keptRows(r) = False
        End If
    Next r

    For c = 0 To nC - 1
        If keptCols(c) Then
            Dim hasContent2 As Boolean
            hasContent2 = False
            For r = 0 To nR - 1
                If keptRows(r) Then
                    If g.CellAt(r, c) <> "" Then
                        hasContent2 = True
                        Exit For
                    End If
                End If
            Next r
            If Not hasContent2 Then keptCols(c) = False
        End If
    Next c
End Sub

' ---- helpers --------------------------------------------------------

' Allocate a Boolean array sized 0..n-1, all False (VBA Booleans default False).
' For n<=0 we still allocate a single dummy slot so the array is always
' dimensioned; callers never index it because every loop is `For 0 To n-1`
' (which is empty when n=0) and the prune/expand passes guard on `size = 0`.
Private Sub AllocFalse(ByRef arr() As Boolean, ByVal n As Long)
    If n <= 0 Then
        ReDim arr(0 To 0)
        arr(0) = False
    Else
        ReDim arr(0 To n - 1)
    End If
End Sub

' SPEC sec.3.1: H = unique non-empty values / non-empty values; 0 if none.
' Mirrors TS heterogeneity(). Uses a Collection keyed by value to count uniques
' (Collection keys are case-sensitive and exact, matching JS Set semantics).
Private Function Heterogeneity(ByRef values() As String) As Double
    Dim nonEmpty As Long
    Dim seen As Collection
    Set seen = New Collection
    Dim i As Long, v As String
    nonEmpty = 0
    For i = LBound(values) To UBound(values)
        v = values(i)
        If v <> "" Then
            nonEmpty = nonEmpty + 1
            If Not SeenContains(seen, v) Then seen.Add True, KeyFor(v)
        End If
    Next i
    If nonEmpty = 0 Then
        Heterogeneity = 0
    Else
        Heterogeneity = seen.Count / nonEmpty
    End If
End Function

' Collection-as-set membership test. Collection has no Contains, so probe by key.
Private Function SeenContains(ByVal seen As Collection, ByVal v As String) As Boolean
    Dim tmp As Variant
    On Error GoTo notFound
    tmp = seen.Item(KeyFor(v))
    SeenContains = True
    Exit Function
notFound:
    SeenContains = False
End Function

' A Collection key is a String; prefix with a sentinel so a value that is itself
' a number-like string can't collide with a positional key, and so "" never used.
Private Function KeyFor(ByVal v As String) As String
    KeyFor = "k:" & v
End Function

' SPEC sec.3.1 data-type inference (used when no declared dataType). Three buckets:
'   "" -> "empty";  /^-?\d+(\.\d+)?$/ -> "number";  else "text".
' Mirrors TS inferType() + NUMERIC_RE. Implemented without regex for portability.
Private Function InferType(ByVal value As String) As String
    If value = "" Then
        InferType = "empty"
    ElseIf IsStrictDecimal(value) Then
        InferType = "number"
    Else
        InferType = "text"
    End If
End Function

' Exact equivalent of /^-?\d+(\.\d+)?$/ : optional leading '-', one or more
' ASCII digits, optional ('.' + one or more ASCII digits). No spaces, no exponent.
Public Function IsStrictDecimal(ByVal s As String) As Boolean
    Dim i As Long, n As Long, ch As String
    n = Len(s)
    If n = 0 Then Exit Function
    i = 1
    If Mid$(s, 1, 1) = "-" Then
        i = 2
        If i > n Then Exit Function   ' just "-"
    End If
    ' integer part: 1+ digits
    Dim digits As Long
    digits = 0
    Do While i <= n
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            digits = digits + 1
            i = i + 1
        Else
            Exit Do
        End If
    Loop
    If digits = 0 Then Exit Function
    If i > n Then
        IsStrictDecimal = True
        Exit Function
    End If
    ' optional fractional part
    If Mid$(s, i, 1) <> "." Then Exit Function
    i = i + 1
    Dim frac As Long
    frac = 0
    Do While i <= n
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            frac = frac + 1
            i = i + 1
        Else
            Exit Do
        End If
    Loop
    If frac = 0 Then Exit Function    ' "1." not allowed
    If i > n Then IsStrictDecimal = True
End Function

' Effective dataType at (r,c): declared if present, else inferred. Mirrors TS
' `type(r,c)` closure in phase1.
Private Function TypeAt(ByVal g As Grid, ByVal r As Long, ByVal c As Long) As String
    Dim declared As String
    declared = g.DeclaredTypeAt(r, c)
    If declared <> "" Then
        TypeAt = declared
    Else
        TypeAt = InferType(g.CellAt(r, c))
    End If
End Function

' Any column where row rA and rB differ in (declared/inferred) type?
Private Function RowTypesDiffer(ByVal g As Grid, ByVal rA As Long, ByVal rB As Long, _
                                ByVal nCols As Long) As Boolean
    Dim c As Long
    For c = 0 To nCols - 1
        If TypeAt(g, rA, c) <> TypeAt(g, rB, c) Then
            RowTypesDiffer = True
            Exit Function
        End If
    Next c
End Function

Private Function ColTypesDiffer(ByVal g As Grid, ByVal cA As Long, ByVal cB As Long, _
                                ByVal nRows As Long) As Boolean
    Dim r As Long
    For r = 0 To nRows - 1
        If TypeAt(g, r, cA) <> TypeAt(g, r, cB) Then
            ColTypesDiffer = True
            Exit Function
        End If
    Next r
End Function

' SPEC sec.3.1 step 3: each anchor a contributes [max(0,a-k), min(size-1,a+k)].
' Mirrors TS expandNeighborhood().
Private Sub ExpandNeighborhood(ByRef anchors() As Boolean, ByVal size As Long, _
                               ByVal k As Long, ByRef kept() As Boolean)
    AllocFalse kept, size
    If size = 0 Then Exit Sub
    Dim a As Long, lo As Long, hi As Long, i As Long
    For a = 0 To size - 1
        If anchors(a) Then
            lo = a - k
            If lo < 0 Then lo = 0
            hi = a + k
            If hi > size - 1 Then hi = size - 1
            For i = lo To hi
                kept(i) = True
            Next i
        End If
    Next a
End Sub
