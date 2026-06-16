VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ChartDescriptor"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'@Folder("SheetCompressor.Core")
' =====================================================================
' ChartDescriptor  --  SPEC sec.1 ChartDescriptor, mirrors the TS type in
'   packages/typescript/src/types.ts
'
' Optional fields use explicit Has* flags because VBA has no null/undefined for
' Strings: a missing `title` is distinct from a present empty title "". The
' renderer (SPEC sec.6.1) and JSON emitter (SPEC sec.6.2) key off these flags exactly
' like the TS `=== undefined` checks.
'
'   - HasTitle / HasXAxis / HasYAxis : the field was present in the source.
'   - DataRanges / Series            : Collections of String; treated as
'                                      "present" iff non-Nothing (see HasData/
'                                      HasSeries). Empty arrays are present but
'                                      render to nothing (SPEC sec.6.1).
' =====================================================================
Option Explicit

Public Name As String
Public ChartType As String        ' "bar" | "line" | "pie" | "scatter" | "area" | "other"
Public AnchorRange As String

Public HasTitle As Boolean
Public Title As String

Public HasData As Boolean
Public DataRanges As Collection   ' of String

Public HasSeries As Boolean
Public Series As Collection       ' of String

Public HasAxes As Boolean         ' the `axes` object was present
Public HasXAxis As Boolean
Public XAxis As String
Public HasYAxis As Boolean
Public YAxis As String

Private Sub Class_Initialize()
    HasTitle = False
    HasData = False
    HasSeries = False
    HasAxes = False
    HasXAxis = False
    HasYAxis = False
    Set DataRanges = New Collection
    Set Series = New Collection
End Sub
