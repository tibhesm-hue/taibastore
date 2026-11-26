@echo off
rem Taiba network bridge - one-time setup on the shop cashier computer: downloads the bridge extension and opens the Chrome extensions page of the POS profile
set "C="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "C=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined C if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "C=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined C if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "C=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined C (
  echo Google Chrome was not found on this computer.
  pause
  exit /b 1
)
mkdir "C:\TaibaNet" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://tibhesm-hue.github.io/taibastore/daftar/netbridge.zip' -OutFile 'C:\TaibaNet\netbridge.zip' -UseBasicParsing; Expand-Archive 'C:\TaibaNet\netbridge.zip' -DestinationPath 'C:\TaibaNet\netbridge' -Force"
if errorlevel 1 (
  echo Download failed. Check the internet and run this file again.
  pause
  exit /b 1
)
set "P=C:\TaibaPOS"
if not exist "%P%" set "P=C:\TaibaDaftar"
if exist "%P%" (start "" "%C%" --user-data-dir=%P% chrome://extensions) else (start "" "%C%" chrome://extensions)
echo.
echo Folder ready: C:\TaibaNet\netbridge
echo In the page that opened: turn on Developer mode, press Load unpacked, choose C:\TaibaNet\netbridge
timeout /t 20 >nul
