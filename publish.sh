#!/bin/bash
# WorkBuddy 微信发布器 - NPM 发布脚本

echo "📦 准备发布到 npm..."
echo ""

# 检查是否登录
echo "[1/4] 检查 npm 登录状态..."
npm whoami || { echo "❌ 请先运行 npm login 登录"; exit 1; }

# 安装依赖
echo ""
echo "[2/4] 安装依赖..."
npm install

# 打包
echo ""
echo "[3/4] 生成 tarball..."
npm run pack

# 发布
echo ""
echo "[4/4] 发布到 npm..."
npm publish --access public

echo ""
echo "✅ 发布成功！"
echo ""
echo "安装方式："
echo "  npm install workbuddy-claw-wechat-publisher"
echo ""
echo "OpenClaw 安装："
echo "  openclaw plugins install workbuddy-claw-wechat-publisher"
