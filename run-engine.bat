@echo off
cd /d C:\Users\tuan_\WorkBuddy\20260317201006\wechat-publisher-plugin
echo Current dir: %CD%
echo.
node scripts\engine.cjs
if errorlevel 1 (
    echo.
    echo Try with full path...
    node "C:\Users\tuan_\WorkBuddy\20260317201006\wechat-publisher-plugin\scripts\engine.cjs"
)
pause