@echo off
rem Double-click this file to publish the latest version of the app to
rem https://missing-person-finder-sabin.netlify.app
rem (The first time, it may open Chrome and ask you to log in to Netlify.)
title Missing Person Finder - publish app
cd /d "%~dp0frontend"
call npm run build || goto :failed
call npx --yes netlify-cli deploy --prod --no-build --dir dist --site missing-person-finder-sabin || goto :failed
echo.
echo Done! Open https://missing-person-finder-sabin.netlify.app
pause
exit /b 0
:failed
echo.
echo Something went wrong. Read the red text above.
pause
exit /b 1
