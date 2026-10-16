@echo off
chcp 65001 >nul
rem 画面を出さずに Agent Deck を裏で起動する (落ちても自動で立ち上げ直す)
cd /d "%~dp0"
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath node -ArgumentList 'daemon.js' -WorkingDirectory '%~dp0'"
echo Agent Deck を裏で起動しました: http://127.0.0.1:8787
