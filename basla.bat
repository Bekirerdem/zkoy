@echo off
rem ZKoy laptop sunucusu: tunel (zkoy.fun) + uyku engelleyici + v2 oyun sunucusu.
rem Kamp/etkinlik oncesi bu dosyayi cift tikla yeter. Pencereyi kapatma.
cd /d "%~dp0"

rem cloudflared zaten calisiyorsa ikinci kopya acma
tasklist /FI "IMAGENAME eq cloudflared.exe" | find /I "cloudflared.exe" >nul
if errorlevel 1 (
  start "zkoy-tunel" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run zkoy
)

rem Uyku engelleyici: ayar degistirmez, bu pencere acikken makine uyumaz.
rem (Kapak kapatma davranisi ayri: kapagi kapatma ya da guc ayarindan "hicbir sey yapma" sec.)
start "zkoy-uyanik" /min powershell -NoProfile -WindowStyle Minimized -Command "$s='[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint e);'; $k=Add-Type -MemberDefinition $s -Name P -Namespace Z -PassThru; while($true){ [void]$k::SetThreadExecutionState(0x80000003); Start-Sleep 30 }"

set ZKOY_CHAIN=zingo
set ZKOY_DB=data\zkoy.sqlite
set ZKOY_OPS_ADDRESS=utest14eeuef0wursvd77xmr7f06ddl7x3h3w6lknc795gkhrvvzvjc6je8vy9v7qgkl55wtw7erwwfpze9uhlj8xkkez5xvl7vv6pwceydmwg
bun run start
