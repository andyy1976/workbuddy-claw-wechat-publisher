@echo off
echo ========================================
echo GitHub Push Script
echo ========================================

cd /d "%~dp0"

echo.
echo Step 1: Adding all files...
git add -A

echo.
echo Step 2: Committing changes...
git commit -m "Initial commit: WorkBuddy Claw WeChat Publisher"

echo.
echo Step 3: Creating GitHub repository...
echo Please run these commands manually if needed:
echo   git remote add origin https://github.com/andyy1976/workbuddy-claw-wechat-publisher.git
echo   git push -u origin master

echo.
echo Done! 
pause
