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

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const COVER_DIR = path.join(ROOT, 'videos', 'bilibili');

// 要同步的作者：B站 mid
const AUTHORS = [
  { mid: 1997403556, name: 'AI搅拌手', keep: 6 },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mmss = (s) => {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
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
  return `${Math.round(buf.length / 1024)} KB`;
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

  // 清理不再被引用的封面，避免仓库无限增长
  const used = new Set(
    out.authors.flatMap((a) => a.videos.map((v) => path.basename(v.cover)))
  );
  for (const f of fs.readdirSync(COVER_DIR)) {
    if (!used.has(f)) {
      fs.unlinkSync(path.join(COVER_DIR, f));
      console.log(`  · 清理旧封面 ${f}`);
    }
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'bilibili.json'),
    JSON.stringify(out, null, 2) + '\n',
    'utf8'
  );
  console.log(`\n✓ 已写入 data/bilibili.json（${out.authors.length} 位作者）`);
})();