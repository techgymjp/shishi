// Android アプリに同梱する Web ファイルを www/ にコピーする
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', 'style.css', 'src', 'vendor', 'assets']) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, item), { recursive: true });
}
// アプリ用のビルド（APP_BUILD=1）では、Web 版だけの部分を取り除く。
// HTML は <!-- web-only --> … <!-- /web-only -->、JS は // web-only:start … // web-only:end で囲む。
// 端末を見分けて隠すのではなく、アプリのバンドルに入れない（ストア審査で「隠した機能」に見えないように）
if (process.env.APP_BUILD === '1') {
  const strip = (file) => {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/[ \t]*<!-- web-only -->[\s\S]*?<!-- \/web-only -->[ \t]*\n?/g, '');
    text = text.replace(/[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end[ \t]*\n?/g, '');
    fs.writeFileSync(file, text);
  };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'assets') walk(f); }
      else if (/\.(html|js|css)$/.test(e.name)) strip(f);
    }
  };
  walk(out);
  // 取り除き忘れがあればビルドを止める
  const leftovers = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'assets') scan(f); }
      else if (/\.(html|js|css)$/.test(e.name) && /play\.google\.com|web-only/.test(fs.readFileSync(f, 'utf8'))) leftovers.push(path.relative(out, f));
    }
  };
  scan(out);
  if (leftovers.length) {
    console.error('アプリ用のビルドに Web 版だけの部分が残っています: ' + leftovers.join(', '));
    process.exit(1);
  }
}

// Google Play 用のビルドでは本番の広告を使う
const mode = process.env.ADMOB_MODE === 'production' ? 'production' : 'test';
fs.writeFileSync(path.join(out, 'ads-config.js'), `// ビルド時に生成\nwindow.AD_MODE = '${mode}';\n`);
// タイトル画面に出すバージョン（CI では VERSION_NAME / VERSION_CODE を使う）
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.env.VERSION_CODE
  ? `v${process.env.VERSION_NAME || pkg.version} (build ${process.env.VERSION_CODE})`
  : 'dev';
fs.writeFileSync(path.join(out, 'build-info.js'), `// ビルド時に生成\nwindow.APP_VERSION = '${version}';\n`);
console.log(`built web assets into www/ (${process.env.APP_BUILD === '1' ? 'app' : 'web'}, ads: ${mode}, version: ${version})`);
