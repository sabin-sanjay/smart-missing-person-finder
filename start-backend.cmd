@echo off
rem Double-click this file to start the backend and put it online.
rem Keep the black window open while you use the app. Close it to stop.
rem
rem AUTO-RESTART: if the backend or its internet tunnel stops (for example
rem the Wi-Fi drops), it starts again by itself after 10 seconds.
title Lumen - backend (auto-restart)
cd /d "%~dp0backend"

:start
echo.
echo [%date% %time%] Starting the Lumen backend...
".venv\Scripts\python.exe" run_public.py
echo.
echo [%date% %time%] The backend stopped. Restarting in 10 seconds...
echo (Close this window to stop it for good.)
timeout /t 10 /nobreak >nul
goto start
