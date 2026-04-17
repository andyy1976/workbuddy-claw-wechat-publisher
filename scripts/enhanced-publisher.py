#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
增强版公众号文章发布系统 - 整合到 wechat-publisher-plugin
功能：
1. 自动分类标签生成与公众号对接
2. 内容质量优化（格式、段落、标点）
3. 自动生成缩略图和内容配图
4. 智能摘要生成
5. SEO优化
6. 全流程自动化：markdown → HTML → 图片上传 → 发布草稿箱

整合自 WorkBuddy Claw 超云艾艾成长日记发布系统
"""

import sys
import os
import datetime
import json
import sqlite3
import re
import random
import requests
from PIL import Image, ImageDraw, ImageFont
import io

# 修复控制台编码
def fix_console_encoding():
    try:
        if sys.stdout.encoding != 'utf-8':
            sys.stdout.reconfigure(encoding='utf-8')
        if sys.stderr.encoding != 'utf-8':
            sys.stderr.reconfigure(encoding='utf-8')
    except Exception as e:
        pass

fix_console_encoding()

class EnhancedPublisher:
    def __init__(self, config_path=None):
        """初始化增强发布器"""
        self.config = self._load_config(config_path)
        
        # 公众号分类标签配置
        self.category_tags = {
            '技术': ['AI', '人工智能', '大模型', '编程', '开发', '技术', '开源', '软件', '硬件', '网络', '数字化', '转型'],
            '产品': ['产品', '设计', '用户体验', '交互', '需求', '原型', '迭代', '测试', '龙虾'],
            '运营': ['运营', '增长', '流量', '转化', '用户', '社群', '活动', '内容', '营销', '品牌'],
            '商业': ['商业', '创业', '投资', '融资', '市场', '产业', '战略'],
            '职场': ['职场', '工作', '成长', '学习', '技能', '管理', '领导力', '团队', '助理'],
            '生活': ['生活', '阅读', '电影', '旅行', '健康', '美食', '健身', '思考']
        }
        
        # 配色方案（生成封面图用）
        self.color_schemes = [
            {'bg': '#667eea', 'text': '#ffffff', 'accent': '#764ba2'},  # 紫蓝渐变
            {'bg': '#f093fb', 'text': '#ffffff', 'accent': '#f5576c'},  # 粉紫渐变
            {'bg': '#4facfe', 'text': '#ffffff', 'accent': '#00f2fe'},  # 蓝绿渐变
            {'bg': '#43e97b', 'text': '#ffffff', 'accent': '#38f9d7'},  # 绿青渐变
            {'bg': '#fa709a', 'text': '#ffffff', 'accent': '#fee140'},  # 粉黄渐变
            {'bg': '#30cfd0', 'text': '#ffffff', 'accent': '#330867'},  # 青紫渐变
            {'bg': '#ff9a9e', 'text': '#000000', 'accent': '#fecfef'},  # 浅粉
            {'bg': '#ffecd2', 'text': '#000000', 'accent': '#fcb69f'},  # 暖橙
        ]
        
        # 字体路径
        self.font_path = None
        try:
            if os.name == 'nt':  # Windows
                self.font_path = 'C:/Windows/Fonts/msyh.ttc'  # 微软雅黑
            else:  # Linux/Mac
                self.font_path = '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'
        except:
            pass
    
    def _load_config(self, config_path):
        """加载配置"""
        if not config_path:
            config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'user-config.json')
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️  加载配置失败: {e}，使用默认配置")
            return {}
    
    def extract_keywords(self, content, title, max_keywords=10):
        """从文章内容中提取关键词"""
        print("\n🔍 步骤1: 提取关键词")
        print("-" * 40)
        
        full_text = title + " " + content
        keyword_counts = {}
        
        for category, keywords in self.category_tags.items():
            for keyword in keywords:
                count = len(re.findall(re.escape(keyword), full_text, re.IGNORECASE))
                if count > 0:
                    keyword_counts[keyword] = count
        
        sorted_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)
        result = [kw for kw, count in sorted_keywords[:max_keywords]]
        
        if not result:
            result = ['科技', '互联网', 'AI', '创新']
        
        print(f"✅ 提取关键词: {', '.join(result)}")
        return result
    
    def generate_categories(self, keywords):
        """根据关键词生成分类标签"""
        print("\n🏷️  步骤2: 生成分类标签")
        print("-" * 40)
        
        category_scores = {}
        for category, category_keywords in self.category_tags.items():
            score = 0
            for kw in keywords:
                if kw in category_keywords:
                    score += 1
            if score > 0:
                category_scores[category] = score
        
        sorted_categories = sorted(category_scores.items(), key=lambda x: x[1], reverse=True)
        result = [cat for cat, score in sorted_categories[:3]]
        
        if not result:
            result = ['科技']
        
        print(f"✅ 生成分类: {', '.join(result)}")
        return result
    
    def optimize_content_quality(self, content, title):
        """优化内容质量 - 格式、标点、段落"""
        print("\n✨ 步骤3: 优化内容质量")
        print("-" * 40)
        
        optimized = content
        
        # 1. 修复常见格式问题
        optimized = re.sub(r'([，。！？；：])\s*', r'\1', optimized)
        optimized = re.sub(r'\s*([，。！？；：])', r'\1', optimized)
        optimized = re.sub(r'([a-zA-Z0-9])\s+([，。！？；：])', r'\1\2', optimized)
        optimized = re.sub(r'([，。！？；：])\s+([a-zA-Z0-9])', r'\1\2', optimized)
        
        # 2. 统一引号格式
        optimized = optimized.replace('"', '“').replace('"', '”')
        optimized = optimized.replace("'", '‘').replace("'", '’')
        
        # 3. 优化段落结构 - 长段落自动分段
        paragraphs = optimized.split('\n\n')
        optimized_paragraphs = []
        for p in paragraphs:
            p = p.strip()
            if not p:
                continue
            if len(p) > 300 and '。' in p:
                sentences = p.split('。')
                current = ''
                for sent in sentences:
                    if not sent:
                        continue
                    current += sent + '。'
                    if len(current) > 150:
                        optimized_paragraphs.append(current.strip())
                        current = ''
                if current:
                    optimized_paragraphs.append(current.strip())
            else:
                optimized_paragraphs.append(p)
        
        optimized = '\n\n'.join(optimized_paragraphs)
        
        # 4. 添加导读和结束语
        intro = f"📝 导读：本文将为你深入解析{title}的核心内容，全文约{len(optimized)}字，阅读需要{max(3, len(optimized) // 300)}分钟。\n\n"
        outro = "\n\n💡 看完本文如果觉得有收获，欢迎点赞、在看、转发给更多朋友！\n"
        optimized = intro + optimized + outro
        
        print(f"✅ 内容优化完成，原长度: {len(content)} 字符，优化后: {len(optimized)} 字符")
        return optimized
    
    def generate_thumbnail(self, title, output_dir, width=1000, height=400):
        """生成文章缩略图/封面"""
        print("\n🖼️  步骤4: 生成封面缩略图")
        print("-" * 40)
        
        try:
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, 'cover.png')
            
            # 选择配色方案
            hash_val = sum(ord(c) for c in title)
            color_scheme = self.color_schemes[hash_val % len(self.color_schemes)]
            
            # 创建图片
            img = Image.new('RGB', (width, height), color=color_scheme['bg'])
            draw = ImageDraw.Draw(img)
            
            # 加载字体
            try:
                if self.font_path and os.path.exists(self.font_path):
                    title_font = ImageFont.truetype(self.font_path, 48)
                    subtitle_font = ImageFont.truetype(self.font_path, 24)
                else:
                    title_font = ImageFont.load_default(size=48)
                    subtitle_font = ImageFont.load_default(size=24)
            except:
                title_font = ImageFont.load_default(size=48)
                subtitle_font = ImageFont.load_default(size=24)
            
            # 标题换行处理
            max_chars_per_line = 20
            lines = []
            current_line = ''
            for char in title:
                if len(current_line) >= max_chars_per_line:
                    lines.append(current_line)
                    current_line = ''
                current_line += char
            if current_line:
                lines.append(current_line)
            
            # 计算文本位置
            line_height = 60
            total_text_height = len(lines) * line_height
            y_start = (height - total_text_height) // 2
            
            # 绘制标题
            for i, line in enumerate(lines):
                bbox = draw.textbbox((0, 0), line, font=title_font)
                text_width = bbox[2] - bbox[0]
                x = (width - text_width) // 2
                y = y_start + i * line_height
                draw.text((x, y), line, font=title_font, fill=color_scheme['text'])
            
            # 绘制副标题
            subtitle = "超云艾艾 技术分享"
            bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
            sub_width = bbox[2] - bbox[0]
            sub_x = (width - sub_width) // 2
            sub_y = height - 80
            draw.text((sub_x, sub_y), subtitle, font=subtitle_font, fill=color_scheme['text'])
            
            # 绘制装饰元素
            draw.line([(50, height - 40), (width - 50, height - 40)], fill=color_scheme['accent'], width=3)
            
            # 保存图片
            img.save(output_path, 'PNG')
            print(f"✅ 封面已生成: {output_path}")
            return output_path
            
        except Exception as e:
            print(f"⚠️  生成封面失败: {e}，使用默认封面")
            return None
    
    def generate_content_images(self, content, output_dir, max_images=3):
        """生成内容配图"""
        print("\n🎨 步骤5: 生成内容配图")
        print("-" * 40)
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        # 提取关键段落
        paragraphs = [p for p in content.split('\n\n') if len(p) > 50 and p.strip()][:max_images]
        generated = []
        
        for i, para in enumerate(paragraphs):
            try:
                img = Image.new('RGB', (800, 400), color='#f8f9fa')
                draw = ImageDraw.Draw(img)
                
                try:
                    if self.font_path and os.path.exists(self.font_path):
                        font = ImageFont.truetype(self.font_path, 24)
                    else:
                        font = ImageFont.load_default(size=24)
                except:
                    font = ImageFont.load_default(size=24)
                
                # 绘制文字
                text = para[:100] + '...' if len(para) > 100 else para
                lines = []
                current = ''
                for char in text:
                    if len(current) >= 25:
                        lines.append(current)
                        current = ''
                    current += char
                if current:
                    lines.append(current)
                
                y = 50
                for line in lines:
                    draw.text((50, y), line, font=font, fill='#333')
                    y += 40
                
                output_path = os.path.join(output_dir, f'image_{i+1}.png')
                img.save(output_path, 'PNG')
                generated.append(output_path)
                print(f"✅ 生成配图 {i+1}: {output_path}")
                
            except Exception as e:
                print(f"⚠️  生成配图 {i+1} 失败: {e}")
                continue
        
        return generated
    
    def generate_seo_metadata(self, title, content, keywords):
        """生成SEO元数据"""
        print("\n🔍 步骤6: 生成SEO元数据")
        print("-" * 40)
        
        # 生成摘要
        plain_text = re.sub(r'<[^>]+>', '', content)
        plain_text = re.sub(r'\s+', ' ', plain_text).strip()
        digest = plain_text[:120] + "..." if len(plain_text) > 120 else plain_text
        
        # 优化标题
        optimized_title = title
        if len(title) < 20:
            optimized_title = f"{title} | 深度解析与实战指南"
        
        author = self.config.get('wechat', {}).get('author', '超云艾艾')
        
        metadata = {
            'title': optimized_title,
            'digest': digest,
            'keywords': ','.join(keywords),
            'author': author
        }
        
        print(f"✅ 摘要生成: {digest[:50]}...")
        return metadata
    
    def _get_access_token(self):
        """获取微信access_token"""
        app_id = self.config.get('wechat', {}).get('appId')
        app_secret = self.config.get('wechat', {}).get('appSecret')
        
        if not app_id or not app_secret:
            print("⚠️  未配置appId/appSecret，使用模拟模式")
            return None
        
        url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={app_id}&secret={app_secret}"
        resp = requests.get(url, timeout=10)
        result = resp.json()
        
        if 'access_token' in result:
            return result['access_token']
        
        print(f"⚠️  获取access_token失败: {result.get('errmsg', '未知错误')}")
        return None
    
    def upload_images_to_wechat(self, image_paths):
        """上传图片到公众号素材库"""
        print("\n📤 步骤7: 上传图片到公众号")
        print("-" * 40)
        
        token = self._get_access_token()
        if not token:
            print("⚠️  无法获取access_token，跳过上传（模拟模式）")
            return ['simulated_media_id_' + str(i) for i in range(len(image_paths))]
        
        media_ids = []
        for img_path in image_paths:
            try:
                if not os.path.exists(img_path):
                    continue
                
                url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
                
                with open(img_path, 'rb') as f:
                    files = {'media': f}
                    resp = requests.post(url, files=files, timeout=30)
                
                result = resp.json()
                
                if 'media_id' in result:
                    media_ids.append(result['media_id'])
                    print(f"✅ 上传成功: {os.path.basename(img_path)} -> {result['media_id'][:16]}...")
                else:
                    print(f"⚠️  上传失败: {result.get('errmsg', '未知错误')}")
                    
            except Exception as e:
                print(f"⚠️  上传异常: {e}")
                continue
        
        return media_ids
    
    def insert_images_into_content(self, html_content, image_media_ids):
        """将图片插入到HTML内容中"""
        if not image_media_ids:
            return html_content
        
        # 在每个H2标签后插入图片
        paragraphs = re.split(r'(<h2[^>]*>.*?</h2>)', html_content)
        result = []
        img_index = 0
        
        for part in paragraphs:
            result.append(part)
            if part.startswith('<h2') and img_index < len(image_media_ids):
                img_html = f'<p style="text-align: center; margin: 20px 0;"><img src="https://mmbiz.qpic.cn/mmbiz_png/{image_media_ids[img_index]}/0" style="max-width: 100%; border-radius: 8px;"></p>'
                result.append(img_html)
                img_index += 1
        
        return ''.join(result)
    
    def publish_to_draft(self, html_content, metadata, thumb_media_id):
        """发布到公众号草稿箱"""
        print("\n🚀 步骤9: 发布到公众号草稿箱")
        print("-" * 40)
        
        token = self._get_access_token()
        if not token:
            print("⚠️  模拟发布成功（实际未配置微信）")
            return {
                'success': True,
                'simulated': True,
                'message': '模拟发布成功'
            }
        
        # 清理digest，移除HTML标签和特殊字符
        plain_digest = re.sub(r'<[^>]+>', '', metadata['digest'])
        plain_digest = re.sub(r'[\n\r\t]+', ' ', plain_digest).strip()
        # 微信digest限制在120个字符以内
        if len(plain_digest) > 120:
            plain_digest = plain_digest[:117] + '...'
        plain_digest = plain_digest[:120]  # 再次保证不超过限制
        
        # 微信标题限制：最多64个字符（Unicode字符计数，每个汉字/字母都算一个字符）
        original_title = metadata['title']
        max_chars = 64
        ellipsis_chars = 3  # ... 占3个字符
        max_content_chars = max_chars - ellipsis_chars
        
        # 直接按字符数截断，微信接口是按字符数计数不是字节数
        if len(original_title) > max_chars:
            title = original_title[:max_content_chars] + '...'
        else:
            title = original_title
        
        print(f"🔍 标题截断: 原长度 {len(original_title)} 字符 → 最终 {len(title)} 字符: {title}")
        
        url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
        
        data = {
            "articles": [{
                "title": title,
                "author": metadata['author'],
                "digest": plain_digest,
                "content": html_content,
                "thumb_media_id": thumb_media_id,
                "show_cover_pic": 1,
                "need_open_comment": 1,
                "only_fans_can_comment": 0
            }]
        }
        
        resp = requests.post(url, json=data, timeout=30)
        result = resp.json()
        
        if 'media_id' in result:
            print(f"✅ 发布成功！草稿ID: {result['media_id']}")
            return {
                'success': True,
                'articleId': result['media_id'],
                'message': '发布成功'
            }
        else:
            print(f"❌ 发布失败: {result.get('errmsg', '未知错误')} (errcode: {result.get('errcode')})")
            return {
                'success': False,
                'message': result.get('errmsg', '未知错误')
            }
    
    def _log_publish_result(self, article_title, status, message, media_id=None, categories=None, keywords=None):
        """记录发布日志到数据库"""
        log_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        log_file = os.path.join(log_dir, 'enhanced_publish_log.db')
        
        conn = sqlite3.connect(log_file)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS publish_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                publish_time TEXT,
                article_title TEXT,
                status TEXT,
                message TEXT,
                media_id TEXT,
                categories TEXT,
                keywords TEXT
            )
        ''')
        
        cursor.execute('''
            INSERT INTO publish_logs (publish_time, article_title, status, message, media_id, categories, keywords)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            datetime.datetime.now().isoformat(),
            article_title,
            status,
            message,
            media_id,
            json.dumps(categories, ensure_ascii=False) if categories else None,
            json.dumps(keywords, ensure_ascii=False) if keywords else None
        ))
        
        conn.commit()
        conn.close()
        
        print(f"✅ 发布日志已记录")
    
    def markdown_to_html(self, markdown_content):
        """简单的Markdown转HTML（适配微信公众号格式）"""
        html = markdown_content
        
        # 处理标题
        html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
        html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
        html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
        
        # 处理粗体
        html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
        html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)
        
        # 处理链接
        html = re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2">\1</a>', html)
        
        # 处理列表
        html = re.sub(r'^\- (.+)$', r'<li>\1</li>', html, flags=re.MULTILINE)
        html = re.sub(r'^\d+\. (.+)$', r'<li>\1</li>', html, flags=re.MULTILINE)
        
        # 处理段落
        paragraphs = html.split('\n\n')
        html_paragraphs = []
        for p in paragraphs:
            p = p.strip()
            if not p:
                continue
            if not p.startswith('<'):
                p = f'<p>{p}</p>'
            html_paragraphs.append(p)
        
        html = '\n'.join(html_paragraphs)
        
        return html
    
    def publish_article_from_file(self, markdown_file, title=None):
        """从markdown文件发布完整文章"""
        print("=" * 80)
        print("🚀 增强版公众号发布系统 v2.0")
        print("整合: 热点采集 → AI写作 → 格式优化 → 图片生成 → 发布草稿")
        print("=" * 80)
        
        try:
            # 1. 读取文章
            print(f"\n📂 读取文章: {markdown_file}")
            with open(markdown_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if not title:
                title_match = re.search(r'^# (.+)$', content, re.MULTILINE)
                if title_match:
                    title = title_match.group(1).strip()
                    content = content.replace(title_match.group(0), '', 1).strip()
                else:
                    title = "技术分享文章"
            
            print(f"✅ 文章标题: {title}")
            
            # 2. 内容质量优化
            optimized_content = self.optimize_content_quality(content, title)
            
            # 3. 提取关键词和分类
            keywords = self.extract_keywords(optimized_content, title)
            categories = self.generate_categories(keywords)
            
            # 4. 生成SEO元数据
            metadata = self.generate_seo_metadata(title, optimized_content, keywords)
            
            # 5. 创建输出目录
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            output_dir = os.path.join(os.path.dirname(__file__), '..', 'output', f'article_{timestamp}')
            os.makedirs(output_dir, exist_ok=True)
            
            # 6. 生成封面缩略图
            thumb_path = self.generate_thumbnail(title, output_dir)
            
            # 7. 生成内容配图
            content_images = self.generate_content_images(optimized_content, output_dir)
            
            # 8. Markdown转HTML
            print("\n📝 步骤8: Markdown转HTML")
            print("-" * 40)
            html_content = self.markdown_to_html(optimized_content)
            
            # 优化HTML格式适配公众号
            print("✅ 优化HTML格式，适配公众号显示")
            html_content = re.sub(r'\s*<li>\s*', r'<li style="display: list-item; margin: 0; padding: 0; line-height: 1.8;">', html_content)
            html_content = re.sub(r'\s*</li>\s*', r'</li>', html_content)
            html_content = re.sub(r'(<ul[^>]*)>', r'\1 style="margin: 10px 0; padding-left: 25px; list-style-type: disc;">', html_content)
            html_content = re.sub(r'\s*(</ul>)', r'\1', html_content)
            html_content = re.sub(r'(<ol[^>]*)>', r'\1 style="margin: 10px 0; padding-left: 25px; list-style-type: decimal;">', html_content)
            html_content = re.sub(r'\s*(</ol>)', r'\1', html_content)
            html_content = re.sub(r'\s*<p>\s*', r'<p style="margin: 10px 0; line-height: 1.8;">', html_content)
            html_content = re.sub(r'\s*</p>\s*', r'</p>', html_content)
            html_content = re.sub(r'\n\s*\n', r'\n', html_content)
            html_content = re.sub(r'<li>(\s*<p>)(.*?)(</p>\s*)</li>', r'<li>\2</li>', html_content)
            
            # 9. 上传图片
            all_images = []
            if thumb_path:
                all_images.append(thumb_path)
            all_images.extend(content_images)
            
            image_media_ids = self.upload_images_to_wechat(all_images)
            
            # 10. 插入图片到内容
            if len(image_media_ids) > 1:
                html_content = self.insert_images_into_content(html_content, image_media_ids[1:])
            
            # 11. 发布到草稿箱
            thumb_media_id = image_media_ids[0] if image_media_ids else self.config.get('wechat', {}).get('thumbMediaID')
            
            result = self.publish_to_draft(html_content, metadata, thumb_media_id)
            
            # 12. 记录日志
            if result.get('success'):
                status = 'success'
                message = result.get('message', '发布成功')
                media_id = result.get('articleId', '')
            else:
                status = 'failed'
                message = result.get('message', '发布失败')
                media_id = None
            
            self._log_publish_result(title, status, message, media_id, categories, keywords)
            
            # 13. 保存发布信息
            publish_info = {
                'publish_time': datetime.datetime.now().isoformat(),
                'title': title,
                'categories': categories,
                'keywords': keywords,
                'article_id': media_id,
                'thumb_media_id': thumb_media_id,
                'content_images': image_media_ids[1:] if len(image_media_ids) > 1 else [],
                'digest': metadata['digest'],
                'status': status,
                'output_dir': output_dir
            }
            
            with open(os.path.join(output_dir, 'publish_info.json'), 'w', encoding='utf-8') as f:
                json.dump(publish_info, f, ensure_ascii=False, indent=2)
            
            print("\n" + "=" * 80)
            if result.get('success'):
                print("✅ 任务执行完成！文章已成功发布到公众号草稿箱")
            else:
                print("❌ 任务执行失败，请检查错误信息")
            print("=" * 80)
            
            return result
        
        except Exception as e:
            print(f"\n❌ 任务执行出错: {e}")
            import traceback
            print(traceback.format_exc())
            if 'title' in locals():
                self._log_publish_result(title, 'error', str(e))
            return {
                'success': False,
                'message': str(e)
            }

def main():
    """主入口"""
    publisher = EnhancedPublisher()
    
    article_file = sys.argv[1] if len(sys.argv) > 1 else None
    if not article_file:
        print("用法: python enhanced-publisher.py <markdown-file> [title]")
        sys.exit(1)
    
    title = sys.argv[2] if len(sys.argv) > 2 else None
    result = publisher.publish_article_from_file(article_file, title)
    
    sys.exit(0 if result.get('success') else 1)

if __name__ == "__main__":
    main()
