#!/usr/bin/env node
/**
 * 抓取作者最新作品，生成 data/bilibili.json 并下载封面到本地。
 *
 * 为什么不在浏览器里实时抓？
 *   bilibili 的开放接口不带 CORS 头，而且风控会返回 412，
 *   浏览器直接 fetch 一定失败。所以改由 CI 定时跑本脚本，
 *   把结果写成同源 JSON，页面只读本地文件。
 *
 * 抖音 / 小红书没有公开接口（抖音要登录态、小红书按 IP 封锁），
 * 因此不在此脚本处理，见 README 说明。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const COVER_DIR = path.join(ROOT, 'videos', 'bilibili');

// 要同步的作者：B站 mid
const AUTHORS = [
  { mid: 1997403556, name: 'AI搅拌手', keep: 6 },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// GitHub 的 ubuntu runner 自带 ffmpeg；本地没有就跳过压缩，不影响功能
const HAS_FFMPEG = (() => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fmtDur = (t) =>
  String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

/**
 * B 站这个接口的 length 字段类型不固定：
 * 有时是秒数（数字），有时是 "08:03"（字符串），两种都要兼容。
 */
const mmss = (s) => {
  if (typeof s === 'string' && s.includes(':')) {
    const p = s.split(':').map(Number);
    if (p.every((n) => !Number.isNaN(n))) {
      const sec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
      return fmtDur(sec);
    }
  }
  return fmtDur(Math.max(0, Math.floor(Number(s) || 0)));
};

/** 带重试的 fetch —— 风控是概率性的，多试几次能显著提高成功率 */
async function get(url, { referer, tries = 4, binary = false } = {}) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.json();
    } catch (e) {
      lastErr = e;
      if (i < tries) {
        const wait = 1500 * i;
        console.warn(`  · 第 ${i} 次失败（${e.message}），${wait}ms 后重试`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function fetchAuthor(mid, keep) {
  const url = `https://api.bilibili.com/x/space/arc/search?mid=${mid}&ps=${keep}&pn=1&order=pubdate`;
  const j = await get(url, { referer: `https://space.bilibili.com/${mid}/video` });
  if (j.code !== 0) throw new Error(`code=${j.code} ${j.message || ''}`);
  const list = (j.data?.list?.vlist) || [];
  return list.slice(0, keep).map((v) => ({
    bvid: v.bvid,
    title: v.title,
    duration: mmss(v.length),
    url: `https://www.bilibili.com/video/${v.bvid}/`,
    embed: `https://player.bilibili.com/player.html?bvid=${v.bvid}&high_quality=1&danmaku=0`,
    cover: `videos/bilibili/${v.bvid}.jpg`,
    coverRemote: v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : '',
    created: v.created || 0,
    play: v.play || 0,
  }));
}

async function downloadCover(video) {
  const dest = path.join(ROOT, video.cover);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) return '已存在';
  if (!video.coverRemote) return '无封面地址';
  const buf = await get(video.coverRemote, { referer: 'https://www.bilibili.com/', binary: true, tries: 3 });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);

  const before = Math.round(buf.length / 1024);
  // 压到宽度 720，去掉元数据 —— B 站原图动辄 300KB，压完通常 60~90KB
  if (HAS_FFMPEG) {
    const tmp = dest + '.tmp.jpg';
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', dest,
        '-vf', 'scale=720:-2', '-q:v', '5', '-map_metadata', '-1', tmp], { stdio: 'ignore' });
      fs.renameSync(tmp, dest);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
  const after = Math.round(fs.statSync(dest).size / 1024);
  return after < before ? `${before} KB → ${after} KB` : `${after} KB`;
}

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(COVER_DIR, { recursive: true });

  const out = { updated: new Date().toISOString(), authors: [] };
  let ok = 0;

  for (const a of AUTHORS) {
    console.log(`\n=== ${a.name} (mid ${a.mid}) ===`);
    try {
      const videos = await fetchAuthor(a.mid, a.keep);
      console.log(`  抓到 ${videos.length} 条`);
      for (const v of videos) {
        try {
          const r = await downloadCover(v);
          console.log(`  · ${v.bvid} 封面 ${r}`);
        } catch (e) {
          console.warn(`  · ${v.bvid} 封面失败: ${e.message}`);
        }
        delete v.coverRemote;
      }
      out.authors.push({ mid: a.mid, name: a.name, videos });
      ok++;
      await sleep(1200);
    } catch (e) {
      console.warn(`  ✗ 抓取失败，保留旧数据：${e.message}`);
    }
  }

  if (!ok) {
    // 全部失败时保留旧数据，并以成功状态退出，避免 CI 报红刷屏
    console.warn('\n全部作者都抓取失败，保留已有的 data/bilibili.json');
    process.exitCode = 0;
    return;
  }



  fs.writeFileSync(
    path.join(DATA_DIR, 'bilibili.json'),
    JSON.stringify(out, null, 2) + '\n',
    'utf8'
  );
  console.log(`\n✓ 已写入 data/bilibili.json（${out.authors.length} 位作者）`);
})();