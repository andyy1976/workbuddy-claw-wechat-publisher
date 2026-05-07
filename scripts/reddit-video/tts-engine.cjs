/**
 * Reddit 短视频管线 - TTS 引擎
 * 支持：Google(免费) / EdgeTTS(微软，免费) / TikTok / ElevenLabs / OpenAI
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { loadEnv } = require('./env-loader.cjs');
loadEnv();

const { ttsConfig } = require('./config.cjs');

// ── 文本预处理 ───────────────────────────────────────────
function preprocessText(text) {
    return text
        .replace(/https?:\/\/\S+/gi, '')           // 删除 URL
        .replace(/\n{3,}/g, '\n\n')                // 压缩多余换行
        .replace(/^\s+|\s+$/g, '')                  // 去除首尾空格
        .replace(/\*\*(.+?)\*\*/g, '$1')           // 去除 Markdown 粗体
        .replace(/\*(.+?)\*/g, '$1')               // 去除 Markdown 斜体
        .replace(/u\/(\w+)/g, '用户 $1')           // Reddit 用户名
        .replace(/r\/(\w+)/g, '社区 r/$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
}

function splitIntoChunks(text, maxChars = 280) {
    // 按句号/问号/感叹号断句
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
        if ((current + sentence).length <= maxChars) {
            current += sentence;
        } else {
            if (current) chunks.push(current.trim());
            current = sentence;
        }
    }
    if (current.trim()) chunks.push(current.trim());

    // 每段至少要有内容
    return chunks.filter(c => c.length > 0);
}

// ── TTS 引擎 0：Google 翻译（免费）────────────────────────
async function googleTTS(text, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            // 使用 gtts 库或直接调用 HTTP
            const gtts = spawn('python', [
                '-c',
                `
import sys
try:
    from gtts import gTTS
    tts = gTTS(text=${JSON.stringify(text)}, lang='zh-CN', slow=False)
    tts.save(${JSON.stringify(outputPath)})
    print('OK')
except ImportError:
    print('NOT_INSTALLED', file=sys.stderr)
    sys.exit(1)
`
            ], { shell: true });

            let err = '';
            gtts.stderr.on('data', d => err += d);
            gtts.on('close', code => {
                if (code === 0) resolve();
                else if (err.includes('NOT_INSTALLED')) {
                    reject(new Error('gTTS 未安装: pip install gTTS'));
                } else reject(new Error('gTTS 失败: ' + err));
            });
        } catch (e) {
            reject(e);
        }
    });
}

// ── TTS 引擎 1：Edge TTS（微软，免费，中文质量高）──────────
async function edgeTTS(text, outputPath) {
    return new Promise((resolve, reject) => {
        const pyCode = `
import asyncio
import sys
try:
    from edge_tts import EdgeTTS
except ImportError:
    print('NOT_INSTALLED', file=sys.stderr)
    sys.exit(1)

async def main():
    tts = EdgeTTS()
    await tts.tts(
        text=${JSON.stringify(text)},
        voice="${ttsConfig.edgeVoice}",
        output=${JSON.stringify(outputPath)},
        rate='+0%',
        volume='+0%'
    )
    print('OK')

asyncio.run(main())
`;
        const proc = spawn('python', ['-c', pyCode], { shell: true });
        let err = '';
        proc.stderr.on('data', d => err += d);
        proc.on('close', code => {
            if (code === 0) resolve();
            else if (err.includes('NOT_INSTALLED')) {
                reject(new Error('edge-tts 未安装: pip install edge-tts'));
            } else reject(new Error('Edge TTS 失败: ' + err));
        });
    });
}

// ── TTS 引擎 2：TikTok TTS（声音辨识度高）─────────────────
async function tiktokTTS(text, outputPath) {
    const { default: axios } = require('axios');
    const sessionId = ttsConfig.tiktokSessionId;

    const encoded = encodeURIComponent(text);
    const url = `https://tiktok-tts.weilbyte.dev/api/generate?text=${encoded}&voice=1_zh-CN`;

    try {
        const resp = await axios.get(url, {
            headers: { 'Cookie': `sessionid=${sessionId}` },
            timeout: 30000,
        });

        if (resp.data?.data?.vnum === undefined) {
            throw new Error('TikTok TTS 返回格式异常: ' + JSON.stringify(resp.data));
        }

        const base64 = resp.data.data.vnum;
        const buf = Buffer.from(base64, 'base64');
        fs.writeFileSync(outputPath, buf);
        resolve();
    } catch (e) {
        if (e.message.includes('NOT_INSTALLED')) {
            throw new Error('TikTok TTS 需要配置 TIKTOK_SESSION_ID');
        }
        throw e;
    }
}

// ── TTS 引擎 3：ElevenLabs（音质最好，付费）────────────────
async function elevenlabsTTS(text, outputPath) {
    const { default: axios } = require('axios');
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ttsConfig.elevenlabsVoiceId}`;

    const resp = await axios.post(url, {
        text,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    }, {
        headers: {
            'xi-api-key': ttsConfig.elevenlabsApiKey,
            'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
    });

    fs.writeFileSync(outputPath, resp.data);
}

// ── TTS 引擎 4：OpenAI TTS ──────────────────────────────
async function openaiTTS(text, outputPath) {
    const https = require('https');
    const body = JSON.stringify({
        model: ttsConfig.openaiModel,
        voice: ttsConfig.openaiVoice,
        input: text,
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/audio/speech',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ttsConfig.openaiApiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            }
        }, res => {
            if (res.headers['content-type']?.includes('application/json')) {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => reject(new Error('OpenAI TTS 失败: ' + d)));
            } else {
                const bufs = [];
                res.on('data', c => bufs.push(c));
                res.on('end', () => {
                    fs.writeFileSync(outputPath, Buffer.concat(bufs));
                    resolve();
                });
            }
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('OpenAI TTS 超时')); });
        req.write(body);
        req.end();
    });
}

// ── 统一 TTS 入口 ───────────────────────────────────────
async function textToSpeech(text, outputPath, options = {}) {
    const cleaned = preprocessText(text);
    const chunks = splitIntoChunks(cleaned);

    console.log(`   🎙️  TTS: "${text.substring(0, 60)}..." → ${chunks.length} 段`);

    const tmpDir = path.join(path.dirname(outputPath), 'tmp_tts');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const engine = ttsConfig.engine;

    for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(tmpDir, `chunk_${i}.mp3`);
        const chunk = chunks[i];

        // 确保有句号结尾
        const finalChunk = /[.!?。！？]$/.test(chunk) ? chunk : chunk + '。';

        try {
            switch (engine) {
                case 0: await googleTTS(finalChunk, chunkPath); break;
                case 1: await edgeTTS(finalChunk, chunkPath); break;
                case 2: await tiktokTTS(finalChunk, chunkPath); break;
                case 3: await elevenlabsTTS(finalChunk, chunkPath); break;
                case 4: await openaiTTS(finalChunk, chunkPath); break;
                default: await edgeTTS(finalChunk, chunkPath); break;
            }
        } catch (e) {
            console.warn(`   ⚠️  TTS 段落 ${i+1} 失败（引擎${engine}）: ${e.message}，跳过`);
        }
    }

    // 合并所有音频片段
    const chunkFiles = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(tmpDir, `chunk_${i}.mp3`);
        if (fs.existsSync(chunkPath)) chunkFiles.push(chunkPath);
    }

    if (chunkFiles.length === 0) {
        throw new Error('所有 TTS 段落均生成失败');
    }

    if (chunkFiles.length === 1) {
        fs.copyFileSync(chunkFiles[0], outputPath);
    } else {
        await concatMP3(chunkFiles, outputPath);
    }

    // 清理临时文件
    try {
        for (const f of chunkFiles) fs.unlinkSync(f);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    console.log(`   ✅ 音频已保存: ${outputPath}`);
    return outputPath;
}

// ── FFmpeg 合并 MP3 ──────────────────────────────────────
async function concatMP3(inputFiles, outputFile) {
    // 生成 ffmpeg concat 文件
    const listFile = path.join(path.dirname(outputFile), 'concat_list.txt');
    const content = inputFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listFile, content, 'utf8');

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-f', 'concat', '-safe', '0',
            '-i', listFile,
            '-c', 'copy',
            outputFile
        ], { shell: true, stdio: 'pipe' });

        let err = '';
        proc.stderr.on('data', d => err += d);
        proc.on('close', code => {
            try { fs.unlinkSync(listFile); } catch {}
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg concat 失败 (code ${code}): ${err}`));
        });
    });
}

// ── 获取音频时长 ────────────────────────────────────────
function getAudioDuration(filePath) {
    try {
        const out = execSync(
            `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
            { shell: true, encoding: 'utf8' }
        );
        return parseFloat(out.trim()) || 0;
    } catch {
        return 0;
    }
}

// ── 获取引擎名称 ────────────────────────────────────────
function getEngineName() {
    const names = ['Google(gTTS)', 'Edge TTS(微软)', 'TikTok', 'ElevenLabs', 'OpenAI TTS'];
    return names[ttsConfig.engine] || 'Unknown';
}

module.exports = {
    preprocessText,
    splitIntoChunks,
    textToSpeech,
    getAudioDuration,
    getEngineName,
    concatMP3,
};
