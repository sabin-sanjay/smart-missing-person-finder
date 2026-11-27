@echo off
rem Double-click this file to publish the latest version of the app to
rem https://missing-person-finder.sabin-sanjay.workers.dev  (Cloudflare, free)
rem (The first time on a computer, it opens Chrome and asks you to log in to Cloudflare.)
title Missing Person Finder - publish app
cd /d "%~dp0frontend"
call npm run build || goto :failed
call npx --yes wrangler deploy || goto :failed
echo.
echo Done! Open https://missing-person-finder.sabin-sanjay.workers.dev
pause
exit /b 0
:failed
echo.
echo Something went wrong. Read the red text above.
pause
exit /b 1
