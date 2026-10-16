@echo off
chcp 65001 >nul
rem 裏で動いている Agent Deck を止める
cd /d "%~dp0"
if exist data\daemon.pid (
  for /f %%p in (data\daemon.pid) do taskkill /pid %%p /T /F
  del data\daemon.pid
) else (
  echo 起動していません
)
