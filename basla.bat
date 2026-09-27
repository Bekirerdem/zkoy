@echo off
rem ZKoy YEREL gelistirme baslaticisi (mock zincir, http://localhost:3131).
rem Canli zkoy.fun artik VPS'te calisiyor (77.90.5.32, systemd: zkoy + cloudflared).
rem Bu dosya TUNEL ACMAZ: ayni tunel laptopta da acilirsa zkoy.fun trafigi ikiye bolunur.
cd /d "%~dp0"
set ZKOY_DB=data\dev.sqlite
bun run dev
