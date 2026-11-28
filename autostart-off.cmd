@echo off
rem Double-click to stop the Lumen backend starting by itself when you log in.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Lumen backend.lnk" 2>nul
echo.
echo Done. The Lumen backend will no longer start by itself.
echo (You can still start it any time with start-backend.cmd.)
pause
