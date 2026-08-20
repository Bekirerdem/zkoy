@echo off
rem ZKoy kalici deploy baslatici: tunel (zkoy.fun) + oyun sunucusu.
rem Makine yeniden basladiginda bu dosyayi cift tikla yeter.
cd /d "%~dp0"

rem cloudflared zaten calisiyorsa ikinci kopya acma
tasklist /FI "IMAGENAME eq cloudflared.exe" | find /I "cloudflared.exe" >nul
if errorlevel 1 (
  start "zkoy-tunel" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run zkoy
)

set ZKOY_CHAIN=zingo
bun run start
