@echo off
rem Taiba - ZATCA link (one time per computer): puts the relay extension into the POS app's own Chrome profile (C:\TaibaPOS)
set "C="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "C=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined C if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "C=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined C if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "C=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined C (
  echo Google Chrome was not found on this computer.
  pause
  exit /b 1
)
mkdir "C:\TaibaPOS" >nul 2>&1
mkdir "C:\TaibaPOS\zrelay" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=3072; (New-Object Net.WebClient).DownloadFile('https://daftar.tibh-esm.workers.dev/zrelay.zip','C:\TaibaPOS\zrelay.zip'); $sh=New-Object -ComObject Shell.Application; $z=$sh.NameSpace('C:\TaibaPOS\zrelay.zip'); $sh.NameSpace('C:\TaibaPOS\zrelay').CopyHere($z.Items(),16+4)"
if not exist "C:\TaibaPOS\zrelay\manifest.json" (
  echo Could not download the link program. Check the internet and run this file again.
  pause
  exit /b 1
)
echo C:\TaibaPOS\zrelay| clip
start "" "%C%" --user-data-dir=C:\TaibaPOS chrome://extensions
echo.
echo  1) Turn ON "Developer mode" (top corner).
echo  2) Click "Load unpacked".
echo  3) In the folder box press Ctrl+V  (C:\TaibaPOS\zrelay)  then Select Folder.
echo  Then close this window and open the POS from the TaibaPOS icon.
pause
