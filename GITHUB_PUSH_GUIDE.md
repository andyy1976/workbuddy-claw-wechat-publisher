# GitHub 推送指南

## 项目位置
`c:/Users/tuan_/WorkBuddy/workbuddy-claw-wechat-publisher`

## 已包含的文件

```
workbuddy-claw-wechat-publisher/
├── .gitignore          # Git 忽略配置
├── README.md           # 项目说明
├── package.json        # 依赖配置
├── push-to-github.bat  # 一键推送脚本
├── docs/
│   └── tutorial.md     # 教程文档
└── src/
    ├── markdown-to-wechat.js  # 主转换器
    └── generate_cover.js      # 封面生成器
```

## 推送到 GitHub 的步骤

### 方法一：双击运行脚本
直接双击 `push-to-github.bat` 文件

### 方法二：手动命令行

```bash
# 1. 进入项目目录
cd c:/Users/tuan_/WorkBuddy/workbuddy-claw-wechat-publisher

# 2. 初始化 Git（如果还没有）
git init

# 3. 添加远程仓库
git remote add origin https://github.com/andyy1976/workbuddy-claw-wechat-publisher.git

# 4. 添加所有文件
git add .

# 5. 提交代码
git commit -m "Initial commit: WorkBuddy Claw WeChat Publisher"

# 6. 推送到 GitHub
git push -u origin master
```

### 首次推送可能需要认证
- 如果没有配置 GitHub SSH key，系统会提示输入用户名和密码
- 或者使用 GitHub CLI: `gh auth login`

## 项目说明

这是一个完整的 WorkBuddy Claw 实战项目：
- ✅ Markdown 转 HTML 转换器
- ✅ 自动封面图生成（10种配色）
- ✅ 完整文档和教程
- ✅ 一键部署到 GitHub

## 本地测试

```bash
# 安装依赖
npm install

# 运行测试
node src/markdown-to-wechat.js README.md output
```
