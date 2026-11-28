'use strict';
/* 打包训练前台：单文件 HTML，数据、模考卷、词典与批改引擎全部内联
   用法：node build.js  →  产出 dist/index.html（双击即可使用） */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const shellPath = path.join(dir, 'desk_shell.html');
let shell = fs.readFileSync(shellPath, 'utf8');

const css = fs.readFileSync(path.join(dir, 'desk_style.css'), 'utf8');
const fonts = path.join(dir, 'fonts');
const fontLicense = fs.readFileSync(path.join(fonts, 'OFL.txt'), 'utf8')
  .split(/\r?\n/).map(line => line.trimEnd()).join('\n');
const displayFonts = [
  ['normal', 'instrument-serif.woff2'],
  ['italic', 'instrument-serif-italic.woff2'],
].map(([style, file]) => {
  const font = fs.readFileSync(path.join(fonts, file)).toString('base64');
  return `@font-face{font-family:"Instrument Serif";font-style:${style};font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${font}) format("woff2")}`;
}).join('\n');
const app = fs.readFileSync(path.join(dir, 'desk_app.js'), 'utf8');
const essay = fs.readFileSync(path.join(dir, 'essay.js'), 'utf8');

const d = JSON.parse(fs.readFileSync(path.join(dir, 'desk_data.json'), 'utf8'));
d.listeningTranscripts = JSON.parse(fs.readFileSync(path.join(dir, 'listening_transcripts.json'), 'utf8'));
d.coreWords = [...new Set(fs.readFileSync(path.join(dir, 'core_words.txt'), 'utf8').trim().split(/\s+/))];
const mockPath = path.join(dir, 'mock_data.json');
if (fs.existsSync(mockPath)) {
  const m = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
  d.mocks = m.mpapers;
  d.mq = m.mquestions;
  Object.assign(d.units, m.munits);
}

const spellPath = path.join(dir, 'spell_words.txt');
const spell = fs.existsSync(spellPath) ? fs.readFileSync(spellPath, 'utf8').trim() : '';
const dictPath = path.join(dir, 'dict_final.txt');
const dict = fs.existsSync(dictPath) ? fs.readFileSync(dictPath, 'utf8').trim() : '';

const data = JSON.stringify(d).replace(/</g, '\\u003c');
/* 版本号：每次构建都变，页面靠它自检有没有被浏览器缓存成旧版 */
const ver = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
shell = shell.replace('"__VER__"', () => JSON.stringify(ver));
shell = shell.replace('/*__CSS__*/', () => `/*\n${fontLicense}\n*/\n${displayFonts}\n${css}`);
shell = shell.replace('/*__DATA__*/{}', () => data);
shell = shell.replace('/*__ESSAY__*/', () => essay);
shell = shell.replace('/*__SPELL__*/""', () => JSON.stringify(spell));
shell = shell.replace('/*__DICT__*/""', () => JSON.stringify(dict));
shell = shell.replace('/*__APP__*/', () => app);

if (shell.indexOf('__DESK__') < 0) throw new Error('数据未注入');
if (shell.indexOf('window.Essay') < 0) throw new Error('批改引擎未注入');

const out = path.join(outDir, 'index.html');
fs.writeFileSync(out, shell, 'utf8');

/* PWA 静态件：manifest、Service Worker、图标、版本文件 */
['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png'].forEach(f => {
  const src = path.join(dir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, f));
});
fs.writeFileSync(path.join(outDir, 'ver.txt'), ver + '\n', 'utf8');

console.log('写入', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB', '| 版本', ver,
  '| 真题', d.questions.length, '| 模题', (d.mq || []).length,
  '| 考点', d.points.length, '| 材料', Object.keys(d.units).length,
  '| 词典', dict ? (dict.split('|').length + ' 条') : '无');
