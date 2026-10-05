/**
 * GET /api/bilibili —— 作者最新视频（实时抓取 + 边缘缓存）
 *
 * 为什么放在 Cloudflare 上：
 *   GitHub runner 的 IP 段被 B站重点限流，Cloudflare 边缘节点是另一套出口。
 *   （实测 B站对机房 IP 也会限流，所以三级降级是必须的）
 *
 * 为什么不需要 cron：
 *   用 Cache API 做 6 小时缓存。过期后第一个访客触发刷新，
 *   等于「按需定时」，不需要 Worker Cron，也就不需要额外权限。
 *
 * 三级降级：
 *   ① 空间投稿接口（能发现新视频）
 *   ② 详情接口逐个刷新已知 bvid（发现不了新视频，但内容保持新鲜）
 *   ③ 静态 data/bilibili.json（构建时生成的兜底数据）
 *
 * bvid 来源（用于 ②）：缓存备份 → 站点静态 JSON
 */

const CACHE_TTL = 6 * 3600;
const BACKUP_TTL = 30 * 24 * 3600;
const CACHE_KEY = 'https://milktea.internal/api/bilibili';
const BACKUP_KEY = 'https://milktea.internal/api/bilibili-backup';

const AUTHORS = [
  { mid: 1997403556, name: 'AI搅拌手', keep: 6 },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const COVER_SUFFIX = '@720w_405h_1c.webp';

const fmtDur = (t) =>
  String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

const mmss = (s) => {
  if (typeof s === 'string' && s.includes(':')) {
    const p = s.split(':').map(Number);
    if (p.every((n) => !Number.isNaN(n))) {
      return fmtDur(p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]);
    }
  }
  return fmtDur(Math.max(0, Math.floor(Number(s) || 0)));
};

const coverUrl = (pic) =>
  pic ? (pic.startsWith('//') ? 'https:' + pic : pic.replace(/^http:/, 'https:')) + COVER_SUFFIX : '';

/** 尽量贴近真实浏览器，降低被风控的概率 */
function biliHeaders(referer) {
  return {
    'User-Agent': UA,
    Referer: referer,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Origin: 'https://space.bilibili.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };
}

async function biliJson(url, referer) {
  const r = await fetch(url, { headers: biliHeaders(referer) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.code !== 0) throw new Error(`code=${j.code} ${j.message || ''}`);
  return j;
}

function toVideo(bvid, title, duration, cover, created, play) {
  return {
    bvid,
    title,
    duration: mmss(duration),
    url: `https://www.bilibili.com/video/${bvid}/`,
    embed: `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&danmaku=0`,
    cover: coverUrl(cover),
    created: created || 0,
    play: play || 0,
  };
}

async function fetchBySpace(mid, keep) {
  const j = await biliJson(
    `https://api.bilibili.com/x/space/arc/search?mid=${mid}&ps=${keep}&pn=1&order=pubdate`,
    `https://space.bilibili.com/${mid}/video`
  );
  const list = (j.data && j.data.list && j.data.list.vlist) || [];
  return list.slice(0, keep).map((v) => toVideo(v.bvid, v.title, v.length, v.pic, v.created, v.play));
}

async function fetchByDetail(bvids, keep) {
  const out = [];
  for (const bvid of bvids.slice(0, keep)) {
    try {
      const j = await biliJson(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        'https://www.bilibili.com/'
      );
      const d = j.data;
      out.push(toVideo(bvid, d.title, d.duration, d.pic, d.pubdate, d.stat && d.stat.view));
    } catch (e) {
      // 单个失败不影响其它
    }
  }
  return out;
}

const readJson = async (req) => {
  try { const r = await fetch(req); return r.ok ? await r.json() : null; } catch { return null; }
};

/** 站点自带的静态数据，作为 bvid 来源和最终兜底 */
const readStatic = (origin) => readJson(origin + '/data/bilibili.json');

async function readBackup() {
  try {
    const r = await caches.default.match(BACKUP_KEY);
    return r ? await r.json() : null;
  } catch { return null; }
}

function bvidsFrom(feed, mid) {
  return ((feed && feed.authors) || [])
    .filter((x) => !mid || x.mid === mid)
    .flatMap((x) => (x.videos || []).map((v) => v.bvid))
    .filter(Boolean);
}

async function build(origin) {
  const backup = (await readBackup()) || (await readStatic(origin));
  const authors = [];
  const notes = [];

  for (const a of AUTHORS) {
    let videos = [];
    try {
      videos = await fetchBySpace(a.mid, a.keep);
      notes.push('space');
    } catch (e) {
      notes.push('space失败:' + e.message);
      const known = bvidsFrom(backup, a.mid);
      if (!known.length) throw new Error(`空间接口失败且无历史记录：${e.message}`);
      videos = await fetchByDetail(known, a.keep);
      notes.push('detail=' + videos.length);
    }
    if (!videos.length) throw new Error('抓到 0 条，视为失败');
    authors.push({ mid: a.mid, name: a.name, videos });
  }

  return { updated: new Date().toISOString(), source: 'cloudflare-pages-function', notes, authors };
}

const jsonRes = (obj, ttl, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
      'Access-Control-Allow-Origin': '*',
      ...extra,
    },
  });

export async function onRequestGet(context) {
  const cache = caches.default;
  const origin = new URL(context.request.url).origin;

  const hit = await cache.match(CACHE_KEY);
  if (hit) return hit;

  try {
    const data = await build(origin);
    context.waitUntil(cache.put(CACHE_KEY, jsonRes(data, CACHE_TTL).clone()));
    context.waitUntil(cache.put(BACKUP_KEY, jsonRes(data, BACKUP_TTL).clone()));
    return jsonRes(data, CACHE_TTL, 200, { 'X-Feed-Source': 'fresh' });
  } catch (e) {
    // 最后兜底：直接吐站点上的静态 JSON
    const stat = await readStatic(origin);
    if (stat && stat.authors && stat.authors.length) {
      return jsonRes(stat, 300, 200, { 'X-Feed-Source': 'static', 'X-Feed-Error': String(e.message).slice(0, 120) });
    }
    return jsonRes({ error: String(e.message), authors: [] }, 60, 503);
  }
}