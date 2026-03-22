@echo off
pushd C:\Users\tuan_\WorkBuddy\20260317201006\wechat-publisher-plugin\scripts
echo 测试 engine-v3.cjs --review-stats
node engine-v3.cjs --review-stats
echo.
echo ================================
echo 测试 engine-v3.cjs --review-list
node engine-v3.cjs --review-list
popd
pause