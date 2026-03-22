@echo off
chcp 65001
cd /d C:\Users\tuan_\WorkBuddy\20260317201006\wechat-publisher-plugin

echo 初始化Git...
git init

echo 添加文件...
git add .

echo 提交...
git commit -m "feat: wechat-publisher v3.0 enterprise edition"

echo.
echo 完成!
git log --oneline -1
pause