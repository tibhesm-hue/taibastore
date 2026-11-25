@echo off
rem Taiba Daftar - one-time setup: desktop shortcut that opens the ledger like a Windows app
set "C="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "C=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined C if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "C=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined C if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "C=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined C (
  echo Google Chrome was not found on this computer.
  pause
  exit /b 1
)
mkdir "C:\TaibaDaftar" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\TaibaDaftar.lnk'); $s.TargetPath='%C%'; $s.Arguments='--user-data-dir=C:\TaibaDaftar --app=https://tibhesm-hue.github.io/taibastore/daftar/'; $s.IconLocation='%C%,0'; $s.Save()"
if errorlevel 1 (
  echo Could not create the shortcut.
  pause
  exit /b 1
)
start "" "%C%" --user-data-dir=C:\TaibaDaftar --app=https://tibhesm-hue.github.io/taibastore/daftar/
echo Done. Use the TaibaDaftar icon on the Desktop from now on.
timeout /t 5 >nul
