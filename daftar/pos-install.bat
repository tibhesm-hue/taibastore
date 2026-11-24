@echo off
rem Taiba POS - one-time setup: desktop shortcut that opens the POS like a Windows app and prints receipts directly
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\TaibaPOS.lnk'); $s.TargetPath='%C%'; $s.Arguments='--kiosk-printing --user-data-dir=C:\TaibaPOS --app=https://daftar.tibh-esm.workers.dev/pos/'; $s.IconLocation='%C%,0'; $s.Save()"
if errorlevel 1 (
  echo Could not create the shortcut.
  pause
  exit /b 1
)
start "" "%C%" --kiosk-printing --user-data-dir=C:\TaibaPOS --app=https://daftar.tibh-esm.workers.dev/pos/
echo Done. Use the TaibaPOS icon on the Desktop from now on.
timeout /t 5 >nul
