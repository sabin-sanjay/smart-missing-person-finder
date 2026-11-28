@echo off
rem OPTIONAL: double-click to make the Lumen backend start by itself every
rem time you log in to Windows (it adds a shortcut to your Startup folder).
rem To undo it, double-click autostart-off.cmd.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP%\Lumen backend.lnk'); $s.TargetPath='%~dp0start-backend.cmd'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo.
echo Done. The Lumen backend will now start by itself when you log in to Windows.
echo (It opens minimised. To turn this off, double-click autostart-off.cmd.)
pause
