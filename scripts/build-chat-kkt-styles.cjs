const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../design/chat-kkt');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
const common = fs.readFileSync(path.join(root, 'common.css'), 'utf8');
const translation = fs.readFileSync(path.join(root, 'translation-subtitles.css'), 'utf8');
// Keep the editable parameters first, followed by a fully removable translation block.
const paramsEnd = common.indexOf('/* ===== 内部图片资源');
const bodyStart = common.indexOf('@layer');
const assets = common.slice(paramsEnd, bodyStart); 
const params = common.slice(0, paramsEnd).replace(/(:root\.chat-room-wrapper\s*\{\s*--ii-self-avatar-display:[^}]+\})/, '/* ===== 默认隐藏我方头像和网名 BEGIN：想显示时删除本整块 ===== */\n$1\n/* ===== 默认隐藏我方头像和网名 END ===== */');
const body = common.slice(bodyStart);
for (const [kind, version, name] of [['glass','0.30.2','悬浮玻璃'], ['flat','1.4.2','经典平面']]) {
  const chrome = fs.readFileSync(path.join(root, `${kind}-chrome.css`), 'utf8');
  const css = `/* ${name} KKT v${version}。JS v0.13.1。单聊/群聊、日间/夜间共用。\n 两版由同一份共通源码生成；只区分顶栏、底栏、引用/回复。完整替换旧 CSS。\n 默认继承消息列表头像轮廓，双方36px；常用参数在下方，隐藏我方身份块可整块删除。 */\n@layer ii-kkt-room-palette.ii-layout, ii-kkt-room-palette.ii-translation;\n/* ===== 00 共通手动参数 BEGIN ===== */\n${params}\n/* ===== 00 共通手动参数 END ===== */\n${assets}\n/* ===== 内部图片资源与图标URL END ===== */\n/* ===== 翻译模块 BEGIN：替换翻译风格时完整替换本区 ===== */\n${translation}\n/* ===== 翻译模块 END ===== */\n/* ===== 共通气泡/布局/语音/卡片 BEGIN：两版逐字一致 ===== */\n${body}\n/* ===== 共通气泡/布局/语音/卡片 END ===== */\n/* ===== ${name}专用：仅顶栏、底栏、引用/回复 BEGIN ===== */\n${chrome}\n/* ===== ${name}专用 END ===== */\n`;
  fs.writeFileSync(path.join(out, `ii-chat-kkt-${kind}-v${version}.css`), css);
}
fs.copyFileSync(path.join(root, 'translation-subtitles.css'), path.join(out, 'translation-subtitles.css'));
console.log(`Built both styles from one shared source: ${out}`);
