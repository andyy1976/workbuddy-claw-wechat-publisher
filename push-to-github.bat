@echo off
<<<<<<< HEAD
chcp 65001 >nul
echo.
echo ========================================
echo  合并插件到 GitHub 仓库
echo  目标: andyy1976/workbuddy-claw-wechat-publisher
echo ========================================
echo.

REM 设置目标目录（修改为你的 git 仓库本地路径）
set REPO_DIR=%~dp0

echo [1/4] 进入仓库目录...
cd /d "%REPO_DIR%"

echo [2/4] 复制插件文件到仓库...

REM 创建目录
if not exist ".codebuddy-plugin" mkdir ".codebuddy-plugin"
if not exist "commands" mkdir "commands"
if not exist "skills\wechat-publisher" mkdir "skills\wechat-publisher"
if not exist "scripts" mkdir "scripts"
if not exist "config" mkdir "config"

REM 复制文件
copy /Y ".codebuddy-plugin\plugin.json" ".codebuddy-plugin\plugin.json" >nul
copy /Y ".codebuddy-plugin\marketplace.json" ".codebuddy-plugin\marketplace.json" >nul
copy /Y "commands\wx-publish.md" "commands\wx-publish.md" >nul
copy /Y "commands\wx-setup.md" "commands\wx-setup.md" >nul
copy /Y "commands\wx-diary.md" "commands\wx-diary.md" >nul
copy /Y "commands\wx-hotspot.md" "commands\wx-hotspot.md" >nul
copy /Y "skills\wechat-publisher\SKILL.md" "skills\wechat-publisher\SKILL.md" >nul
copy /Y "scripts\engine.js" "scripts\engine.js" >nul
copy /Y "config\example-config.json" "config\example-config.json" >nul
copy /Y "package.json" "package.json" >nul

echo [3/4] Git commit...
git add -A
git commit -m "feat: 合并 CodeBuddy 插件结构 v1.1 - 添加 commands/skills/scripts"

echo [4/4] 推送到 GitHub...
git push origin master

echo.
echo ========================================
echo  完成！访问以下地址安装插件：
echo  /plugin marketplace add andyy1976/workbuddy-claw-wechat-publisher
echo ========================================
=======
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
>>>>>>> 8f8a0157cbc9156f77fc0b94f004b1d55bb75b21
pause
