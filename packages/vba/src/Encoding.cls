VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Encoding"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'@Folder("SheetCompressor.Core")
' =====================================================================
' Encoding  --  one encoding's output, mirroring the TS `Encoding` type
' (packages/typescript/src/types.ts):  { string, json, tokenEstimate }.
'
'   StringForm   : the canonical string form (cells + appended chart block).
'   JsonForm     : the canonical JSON text (2-space, trailing newline; chart
'                  data is NOT included in JSON per SPEC sec.6.2).
'   TokenEstimate: counter applied to StringForm (the chart-extended string).
' =====================================================================
Option Explicit

Public StringForm As String
Public JsonForm As String
Public TokenEstimate As Long
