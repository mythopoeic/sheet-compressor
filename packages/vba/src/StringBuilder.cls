VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "StringBuilder"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'@Folder("SheetCompressor.Core")
' =====================================================================
' StringBuilder  --  amortized-O(1) string accumulation for the canonical JSON
' emitter and string encoders. VBA has no native StringBuilder; naive `s = s & x`
' is O(n^2). This uses a doubling Mid$-into-preallocated-buffer scheme.
'
' Pure utility: no Excel deps. Append exact bytes only -- it performs NO
' escaping or formatting (that is ScJson / ScEncodings' job).
' =====================================================================
Option Explicit

Private mBuffer As String
Private mLength As Long          ' used length (UTF-16 code units)

Private Sub Class_Initialize()
    mBuffer = ""
    mLength = 0
End Sub

Public Sub Append(ByVal s As String)
    Dim addLen As Long
    addLen = Len(s)
    If addLen = 0 Then Exit Sub

    Dim cap As Long
    cap = Len(mBuffer)
    If mLength + addLen > cap Then
        Dim newCap As Long
        newCap = cap
        If newCap < 64 Then newCap = 64
        Do While newCap < mLength + addLen
            newCap = newCap * 2
        Loop
        mBuffer = mBuffer & Space$(newCap - cap)
    End If

    Mid$(mBuffer, mLength + 1, addLen) = s
    mLength = mLength + addLen
End Sub

Public Function ToString() As String
    ToString = Left$(mBuffer, mLength)
End Function

Public Property Get Length() As Long
    Length = mLength
End Property
