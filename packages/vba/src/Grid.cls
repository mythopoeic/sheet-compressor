VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Grid"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'@Folder("SheetCompressor.Core")
' =====================================================================
' Grid  --  the pure input contract (SPEC sec.1), with NO Excel-object deps.
'
' Mirrors the TypeScript `Grid` type in
'   packages/typescript/src/types.ts
'
' A Grid is a row-major rectangle of cell *strings* plus the 1-indexed A1
' origin of rows(0,0). Ragged input is normalised to a rectangle padded with
' "" (SPEC sec.1 "Let C be the maximum row length ... padded to C cells with """).
'
' Storage:
'   - Cells       : 2D String array, 0-based, dims (0..RowCount-1, 0..ColCount-1).
'                   "" is the empty cell. A whitespace-only string is NOT empty.
'   - DataTypes   : OPTIONAL 2D String array, same dims, holding the declared
'                   cellMeta.dataType per cell ("" = not declared, infer it).
'                   v0 only reads dataType (SPEC sec.1 CellMeta).
'   - Charts      : OPTIONAL Collection of ChartDescriptor (SPEC sec.1 / sec.6).
'
' Build one via SheetCompressorCore.NewGridFromArray (host glue / harness) or
' the From* helpers below.
' =====================================================================
Option Explicit

Private mCells() As String        ' (0..RowCount-1,0..ColCount-1); VBA bars Public arrays on a class, so backed privately + exposed via Property Get/Let Cells + RedimCells
Public RowCount As Long
Public ColCount As Long

' Original (un-padded) length of each source row, 0..RowCount-1. The encodings
' work on the padded rectangle (SPEC sec.1), but the raw-baseline (SPEC sec.7
' vanillaEncode) joins the ORIGINAL ragged rows -- so a short row contributes
' fewer " | " separators. RowLen preserves that. When unset (host glue that has
' no raggedness, e.g. UsedRange), RowLenValid stays False and the baseline falls
' back to ColCount for every row (a true rectangle, no raggedness to honour).
Public OriginRow As Long          ' 1-indexed A1 row of Cells(0,0)
Public OriginCol As Long          ' 1-indexed A1 col of Cells(0,0)

Public HasDataTypes As Boolean
Private mDataTypes() As String    ' (0..RowCount-1,0..ColCount-1) when HasDataTypes; see Property Get/Let DataTypes + RedimDataTypes

Public Charts As Collection       ' of ChartDescriptor; may be Nothing/empty

Public RowLenValid As Boolean
Private mRowLen() As Long         ' original source row lengths when RowLenValid; see Property Get/Let RowLen + RedimRowLen

Private Sub Class_Initialize()
    RowCount = 0
    ColCount = 0
    OriginRow = 1
    OriginCol = 1
    HasDataTypes = False
    RowLenValid = False
    Set Charts = New Collection
End Sub

' Effective length of source row r for the raw baseline. Uses the original
' ragged length when known, else the full ColCount.
Public Function BaselineRowLen(ByVal r As Long) As Long
    If RowLenValid Then
        BaselineRowLen = Me.RowLen(r)
    Else
        BaselineRowLen = ColCount
    End If
End Function

' Safe cell accessor (mirrors TS `cell(r,c) = grid.rows[r]?.[c] ?? ""`).
' Out-of-range -> "" so callers never have to bounds-check.
Public Function CellAt(ByVal r As Long, ByVal c As Long) As String
    If r < 0 Or r >= RowCount Or c < 0 Or c >= ColCount Then
        CellAt = ""
    Else
        CellAt = Me.Cells(r, c)
    End If
End Function

' Declared dataType for (r,c), or "" when none was supplied.
Public Function DeclaredTypeAt(ByVal r As Long, ByVal c As Long) As String
    If Not HasDataTypes Then
        DeclaredTypeAt = ""
    ElseIf r < 0 Or r >= RowCount Or c < 0 Or c >= ColCount Then
        DeclaredTypeAt = ""
    Else
        DeclaredTypeAt = Me.DataTypes(r, c)
    End If
End Function

' Cells / DataTypes / RowLen are exposed as parametrised properties because VBA
' forbids Public array members on a class module. Element read/write goes through
' the Get/Let pairs; (re)allocation goes through the Redim* subs.
Public Sub RedimCells(ByVal nR As Long, ByVal nC As Long)
    ReDim mCells(0 To nR - 1, 0 To nC - 1)
End Sub

Public Property Get Cells(ByVal r As Long, ByVal c As Long) As String
    Cells = mCells(r, c)
End Property

Public Property Let Cells(ByVal r As Long, ByVal c As Long, ByVal v As String)
    mCells(r, c) = v
End Property

Public Sub RedimDataTypes(ByVal nR As Long, ByVal nC As Long)
    ReDim mDataTypes(0 To nR - 1, 0 To nC - 1)
End Sub

Public Property Get DataTypes(ByVal r As Long, ByVal c As Long) As String
    DataTypes = mDataTypes(r, c)
End Property

Public Property Let DataTypes(ByVal r As Long, ByVal c As Long, ByVal v As String)
    mDataTypes(r, c) = v
End Property

Public Sub RedimRowLen(ByVal nR As Long)
    ReDim mRowLen(0 To nR - 1)
End Sub

Public Property Get RowLen(ByVal r As Long) As Long
    RowLen = mRowLen(r)
End Property

Public Property Let RowLen(ByVal r As Long, ByVal v As Long)
    mRowLen(r) = v
End Property
