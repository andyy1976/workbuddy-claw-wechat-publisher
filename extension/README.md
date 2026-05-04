# 小红书Chrome扩展说明
本目录用于存放小红书发布所需的Chrome扩展，**需手动从xiaohongshu-skills提取**：

## 获取方式
1. 下载郭震的xiaohongshu-skills：`git clone https://github.com/autoclaw-cc/xiaohongshu-skills.git`
2. 复制其`extension`目录到本目录：`xiaohongshu-skills/extension` → `D:\.qclaw\workspace\wechat-publisher-plugin\extension\xiaohongshu`
3. 最终路径应为：`D:\.qclaw\workspace\wechat-publisher-plugin\extension\xiaohongshu\manifest.json`

## 加载验证
1. 打开Chrome浏览器，访问`chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择上述`xiaohongshu`目录
4. 确认扩展加载成功，无报错

## 脚本引用路径
发布脚本已配置扩展路径：`D:\.qclaw\workspace\wechat-publisher-plugin\extension\xiaohongshu`
如需修改，编辑`scripts/publish-xiaohongshu.js`的`extensionPath`变量
