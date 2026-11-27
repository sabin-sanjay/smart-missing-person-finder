@echo off
rem Double-click this file to start the backend and put it online.
rem Keep the black window open while you use the app. Close it to stop.
title Missing Person Finder - backend
cd /d "%~dp0backend"
".venv\Scripts\python.exe" run_public.py
pause
