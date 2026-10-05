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

/**
 * B 站 CDN 自带图片处理：在图片地址后面拼参数就能拿到缩放/裁剪后的图。
 *   @720w_405h_1c.webp → 720×405（16:9 裁切）的 webp
 * 实测原图 277KB → 51KB，比下载原图再本地压缩省事得多，
 * 也避免了在 CI 上装 ffmpeg（Ubuntu runner 并不预装）。
 */
const COVER_SUFFIX = '@720w_405h_1c.webp';


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
async function get(url, { referer, tries = 6, binary = false } = {}) {
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
        // B 站风控是渐进式的，退避给足，避免刚被限流就连续撞墙
        const wait = Math.min(3000 * Math.pow(2, i - 1), 30000);
        console.warn(`  · 第 ${i} 次失败（${e.message}），${Math.round(wait / 1000)}s 后重试`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/** 主通道：空间投稿列表（能发现新视频，但容易被风控限流） */
async function fetchBySpace(mid, keep) {
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
    cover: `videos/bilibili/${v.bvid}.webp`,
    coverRemote: v.pic
      ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic.replace(/^http:/, 'https:')) + COVER_SUFFIX
      : '',
    created: v.created || 0,
    play: v.play || 0,
  }));
}

/** 读取上一次同步到的 bvid 列表（用于降级刷新） */
function knownBvids() {
  try {
    const f = path.join(DATA_DIR, 'bilibili.json');
    if (!fs.existsSync(f)) return [];
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return (j.authors || []).flatMap((a) => (a.videos || []).map((v) => v.bvid)).filter(Boolean);
  } catch { return []; }
}

/**
 * 降级通道：空间接口被限流时，用「视频详情接口」逐个刷新已有作品。
 * 实测空间接口会返回 412 / code=-799，而详情接口宽松得多。
 * 缺点：发现不了新视频，但能保证已收录的内容和封面保持新鲜。
 */
async function fetchByDetail(bvidList, keep) {
  const ids = bvidList.slice(0, keep);
  if (!ids.length) throw new Error('没有已知的 bvid，无法降级');
  const out = [];
  for (const bvid of ids) {
    try {
      const j = await get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        { referer: 'https://www.bilibili.com/', tries: 3 });
      if (j.code !== 0) { console.warn(`  · ${bvid} 详情 code=${j.code}`); continue; }
      const d = j.data;
      out.push({
        bvid,
        title: d.title,
        duration: mmss(d.duration),
        url: `https://www.bilibili.com/video/${bvid}/`,
        embed: `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&danmaku=0`,
        cover: `videos/bilibili/${bvid}.webp`,
        coverRemote: (d.pic || '').replace(/^http:/, 'https:') + COVER_SUFFIX,
        created: d.pubdate || 0,
        play: d.stat?.view || 0,
      });
    } catch (e) {
      console.warn(`  · ${bvid} 详情失败：${e.message}`);
    }
    await sleep(700);
  }
  return out;
}

/** 先走空间接口，失败则降级到详情接口 */
async function fetchAuthor(mid, keep) {
  try {
    return await fetchBySpace(mid, keep);
  } catch (e) {
    console.warn(`  · 空间接口失败（${e.message}），改用详情接口刷新已知作品`);
    return await fetchByDetail(knownBvids(), keep);
  }
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
      // ⚠️ 必须挡住「0 条」：两个接口都被限流时会返回空数组，
      //    如果当成成功就会用空数据覆盖掉仓库里的好数据。
      if (!videos.length) throw new Error('抓到 0 条，视为抓取失败');
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



  // 只清理自动生成的 .webp 封面；手工挑选的 .jpg 一律不动
  if (fs.existsSync(COVER_DIR)) {
    const used = new Set(out.authors.flatMap((a) => a.videos.map((v) => path.basename(v.cover))));
    for (const f of fs.readdirSync(COVER_DIR)) {
      if (f.endsWith('.webp') && !used.has(f)) {
        fs.unlinkSync(path.join(COVER_DIR, f));
        console.log(`  · 清理过期封面 ${f}`);
      }
    }
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'bilibili.json'),
    JSON.stringify(out, null, 2) + '\n',
    'utf8'
  );
  console.log(`\n✓ 已写入 data/bilibili.json（${out.authors.length} 位作者）`);
})();