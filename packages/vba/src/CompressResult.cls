VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CompressResult"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'@Folder("SheetCompressor.Core")
' =====================================================================
' CompressResult  --  mirrors the TS CompressResult type
' (packages/typescript/src/types.ts).
'
'   Anchor / InvertedIndex / FormatAggregation : Encoding objects (sec.3/sec.4/sec.5).
'   ChartsJson           : canonical charts.json text (SPEC sec.6.2 echo).
'   RawBaselineTokens    : token estimate of the vanilla baseline (SPEC sec.7).
' =====================================================================
Option Explicit

Public Anchor As Encoding
Public InvertedIndex As Encoding
Public FormatAggregation As Encoding
Public ChartsJson As String
Public RawBaselineTokens As Long
