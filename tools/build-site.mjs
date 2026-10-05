#!/usr/bin/env node
/**
 * 把站点复制到 dist/，供 Cloudflare Pages 之类的静态托管使用。
 *
 * 为什么不直接把仓库根目录当输出？
 *   因为根目录里有 .git / .github / tools / node_modules，
 *   当输出目录会把它们一起暴露成公开静态文件。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

// 需要发布的顶层条目（不存在会自动跳过）
const INCLUDE = [
  'index.html',
  'wall.html',
  'styles.css',
  'app.js',
  '.nojekyll',
  'videos',   // 本地视频 + 封面
  'data',     // 同步脚本生成的最新作品 JSON
];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let count = 0;
for (const name of INCLUDE) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) {
    console.log(`  · 跳过（不存在）${name}`);
    continue;
  }
  fs.cpSync(src, path.join(DIST, name), { recursive: true });
  const st = fs.statSync(src);
  console.log(`  · ${name}${st.isDirectory() ? '/' : ''}`);
  count++;
}

const size = (dir) => {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? size(p) : fs.statSync(p).size;
  }
  return total;
};

console.log(`\n✓ 已生成 dist/  （${count} 项，${(size(DIST) / 1024 / 1024).toFixed(2)} MB）`);