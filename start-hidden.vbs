Option Explicit
' Agent Deck: start daemon.js without a console window (used by the Startup shortcut)
Dim sh, fso, dir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "node """ & dir & "\daemon.js""", 0, False
