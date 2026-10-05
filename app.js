/* ============================================================
 * ★ 配置区（只需要改这里）★
 * ============================================================ */

const PAY_CONFIG = {
  // ① 微信收款码（放在本文件同一文件夹，改文件名即可）
  wechat_qr: "1.png",
  // ② 支付宝收款码（放在本文件同一文件夹）
  alipay_qr: "alipay_qr.jpg",
  // ③ 网盘分享链接（没有就填 ""）
  quark_url: "https://pan.quark.cn/s/a6100d7f551a?pwd=FxM9",
  // ④ 网盘提取码（没有就填 ""）
  quark_code: "1234",
  // ⑤ 站名（导航栏 / 页脚）
  site_name: "请我喝杯奶茶",
  // ⑥ 预设金额
  amounts: [5, 10, 20, 35, 68],
};

/* 创作者列表：可自由增删改
 * tag   → 用于筛选的分类
 * goal  → 本月目标金额（用于进度条），不需要可写 0
 */
const DEFAULT_CREATORS = [
  { id: 1, name: "精品软件", emoji: "🎨", tag: "设计",
    desc: "每天更新一幅插画，把生活画成温柔的样子的插画师。",
    intro: "每天更新一幅插画", supporters: 128, goal: 2000, raised: 1420 },
  { id: 2, name: "视频教程", emoji: "💻", tag: "技术",
    desc: "写技术博客和开源项目，每周更新一期实用视频教程。",
    intro: "写技术博客和开源项目", supporters: 342, goal: 5000, raised: 3860 },
  { id: 3, name: "提供情绪价值", emoji: "🎙️", tag: "生活",
    desc: "每晚一个治愈故事，陪你度过那些睡不着的晚上。",
    intro: "每晚一个治愈故事", supporters: 96, goal: 1500, raised: 610 },
];

const QUICK_MSGS = ["创作加油！", "谢谢你的陪伴 💛", "请喝杯奶茶 🧋", "期待更新～"];

/* ============================================================
 * 以下代码一般不需要改动
 * ============================================================ */
let creators = loadCreators();
let current = null, amount = 20, isCustom = false, payMethod = "wx", activeTag = "全部";

function loadCreators() {
  try {
    const saved = JSON.parse(localStorage.getItem("bmc_creators_v2"));
    if (Array.isArray(saved) && saved.length) {
      // 合并新字段，避免旧数据缺字段
      return DEFAULT_CREATORS.map(d => ({ ...d, ...(saved.find(s => s.id === d.id) || {}) }));
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_CREATORS));
}
function save() {
  try { localStorage.setItem("bmc_creators_v2", JSON.stringify(creators)); } catch (e) {}
}

/* ---------- 主题 ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#15110E" : "#FDF9F3");
}
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("bmc_theme", next); } catch (e) {}
}
applyTheme((() => { try { return localStorage.getItem("bmc_theme") || "light"; } catch (e) { return "light"; } })());

/* ---------- 渲染 ---------- */
function render() {
  const list = document.getElementById("creatorList");
  if (!list) return;
  const searchEl = document.getElementById("searchInput");
  const kw = ((searchEl ? searchEl.value : "") || "").trim().toLowerCase();
  const data = creators.filter(c => {
    const okTag = activeTag === "全部" || c.tag === activeTag;
    const okKw = !kw || (c.name + c.desc + c.intro + c.tag).toLowerCase().includes(kw);
    return okTag && okKw;
  });

  if (!data.length) {
    list.innerHTML = '<div class="empty"><span class="e">🔍</span>没有找到匹配的创作者，换个关键词试试～</div>';
  } else {
    list.innerHTML = data.map(c => {
      const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
      return `
      <article class="card creator">
        <div class="creator-top">
          <div class="avatar">${c.emoji}</div>
          <div class="who">
            <h3>${c.name}<span class="verified">已认证</span></h3>
            <p>${c.intro}</p>
          </div>
        </div>
        <p class="desc">${c.desc}</p>
        <div class="tags"><span class="tag">#${c.tag}</span><span class="tag">#奶茶续命</span></div>
        ${c.goal > 0 ? `
        <div class="goal">
          <div class="goal-bar"><div class="goal-fill" data-pct="${pct}"></div></div>
          <div class="goal-meta"><span>本月目标 ¥${c.goal}</span><span>已完成 ${pct}%</span></div>
        </div>` : ""}
        <div class="creator-foot">
          <span class="supporters">❤️ <b>${c.supporters}</b> 人支持过</span>
          <button class="btn btn-primary" onclick="openSheet(${c.id})">请喝一杯</button>
        </div>
      </article>`;
    }).join("");
    // 进度条动画
    requestAnimationFrame(() => {
      list.querySelectorAll(".goal-fill").forEach(el => { el.style.width = el.dataset.pct + "%"; });
    });
  }

  // 手机预览 & 统计
  const phoneList = document.getElementById("phoneList");
  if (phoneList) phoneList.innerHTML = creators.slice(0, 3).map(c => `
    <div class="p-item">
      <div class="av">${c.emoji}</div>
      <div class="tx"><b>${c.name}</b><span>❤️ ${c.supporters} 人支持</span></div>
      <div class="p-btn">请喝</div>
    </div>`).join("");
  const total = creators.reduce((s, c) => s + (+c.supporters || 0), 0);
  const scEl = document.getElementById("statCreators"), spEl = document.getElementById("statSupporters");
  if (scEl) scEl.textContent = creators.length;
  if (spEl) spEl.textContent = total;

  renderFilters();
}

function renderFilters() {
  const host = document.getElementById("filters");
  if (!host) return;
  const tags = ["全部", ...new Set(creators.map(c => c.tag).filter(Boolean))];
  host.innerHTML = tags.map(t =>
    `<button class="chip" aria-pressed="${t === activeTag}" onclick="setTag('${t}')">${t}</button>`
  ).join("");
}
function setTag(t) { activeTag = t; render(); }

function renderQuickMsgs() {
  const host = document.getElementById("quickMsg");
  if (!host) return;
  host.innerHTML = QUICK_MSGS.map((m, i) =>
    `<button type="button" onclick="useQuickMsg(${i})">${m}</button>`).join("");
}
function useQuickMsg(i) {
  const ta = document.getElementById("mMsg");
  ta.value = QUICK_MSGS[i];
  ta.dispatchEvent(new Event("input"));
}

/* ---------- 打赏面板 ---------- */
function openSheet(id) {
  current = creators.find(c => c.id === id) || creators[0];
  amount = 20; isCustom = false;

  document.getElementById("mAvatar").textContent = current.emoji;
  document.getElementById("qrAvatar").textContent = current.emoji;
  document.getElementById("mName").textContent = "支持 " + current.name;
  document.getElementById("mDesc").textContent = current.intro;
  document.getElementById("qrDesc").textContent = "支持 " + current.name;
  document.getElementById("mMsg").value = "";
  document.getElementById("msgCount").textContent = "0/60";
  document.getElementById("customInput").value = "";
  document.getElementById("customRow").classList.remove("show");

  renderAmounts();
  updatePayBtn();
  showStep("stepAmount");
  document.getElementById("sheetMask").classList.add("show");
  document.getElementById("sheet").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  const m = document.getElementById("sheetMask"), s = document.getElementById("sheet");
  if (m) m.classList.remove("show");
  if (s) s.classList.remove("show");
  document.body.style.overflow = "";
}
function showStep(id) {
  document.getElementById("stepAmount").style.display = id === "stepAmount" ? "block" : "none";
  document.getElementById("stepQR").classList.toggle("show", id === "stepQR");
  document.getElementById("sheet").scrollTop = 0;
}

function renderAmounts() {
  document.querySelectorAll("#amountGrid button").forEach(b => {
    const v = b.dataset.v;
    if (v === "custom") {
      b.classList.toggle("active", isCustom);
    } else {
      b.textContent = "¥" + v;
      b.classList.toggle("active", !isCustom && +v === amount);
    }
  });
}
function pick(btn) {
  if (btn.dataset.v === "custom") {
    isCustom = true;
    document.getElementById("customRow").classList.add("show");
    setTimeout(() => document.getElementById("customInput").focus(), 260);
  } else {
    isCustom = false;
    amount = +btn.dataset.v;
    document.getElementById("customRow").classList.remove("show");
  }
  renderAmounts();
  updatePayBtn();
}
function parseAmount() {
  if (!isCustom) return amount;
  const raw = (document.getElementById("customInput").value || "").replace(/[^\d.]/g, "");
  const n = Math.floor(parseFloat(raw) * 100) / 100;
  return isFinite(n) && n > 0 ? n : 0;
}
function updatePayBtn() {
  const val = parseAmount();
  const btn = document.getElementById("payBtn");
  btn.textContent = val > 0 ? `去支付 ¥${val} →` : "请输入有效金额";
  btn.disabled = !(val > 0);
}
/* ---------- 扫码支付 ---------- */
function showQR() {
  const val = parseAmount();
  if (!(val > 0)) return;
  amount = val;
  document.getElementById("qrAmount").textContent = amount;
  document.getElementById("copyAmountVal").textContent = amount;
  switchPay("wx");
  showStep("stepQR");
}
function backToAmount() { showStep("stepAmount"); }

function switchPay(m) {
  payMethod = m;
  const wx = m === "wx";
  document.getElementById("tabWx").className = wx ? "active-wx" : "";
  document.getElementById("tabAli").className = wx ? "" : "active-ali";
  const frame = document.getElementById("qrFrame");
  const img = document.getElementById("qrImg");
  frame.classList.remove("missing");
  img.onerror = () => frame.classList.add("missing");
  img.src = wx ? PAY_CONFIG.wechat_qr : PAY_CONFIG.alipay_qr;
  document.getElementById("qrHint").innerHTML = wx
    ? "截图保存二维码 → 打开微信「扫一扫」<br>选择相册中的截图即可付款"
    : "截图保存二维码 → 打开支付宝「扫一扫」<br>选择相册中的截图即可付款";
}

/* ---------- 支付完成 ---------- */
function isInWeChatOrQQ() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("micromessenger") || ua.includes("qq/") || ua.includes("qzone");
}
function finishPay() {
  const c = creators.find(x => x.id === current.id);
  if (c) { c.supporters++; c.raised = (c.raised || 0) + amount; save(); }
  closeSheet();
  render();

  const code = (PAY_CONFIG.quark_code || "").trim();
  document.getElementById("successName").textContent = current.name;
  document.getElementById("codeCard").style.display = code ? "block" : "none";
  if (code) document.getElementById("codeVal").textContent = code;
  const nd = document.getElementById("netdiskBtn");
  if (PAY_CONFIG.quark_url) { nd.style.display = "flex"; nd.href = PAY_CONFIG.quark_url; }
  else { nd.style.display = "none"; }

  if (isInWeChatOrQQ()) {
    document.getElementById("guideCode").textContent = code || "无";
    document.getElementById("guideOverlay").classList.add("show");
  } else {
    document.getElementById("successOverlay").classList.add("show");
  }
  document.body.style.overflow = "hidden";
}
function closeSuccess() {
  const el = document.getElementById("successOverlay");
  if (el) el.classList.remove("show");
  document.body.style.overflow = "";
}
function closeGuide() {
  const el = document.getElementById("guideOverlay");
  if (el) el.classList.remove("show");
  document.body.style.overflow = "";
}

/* ---------- 复制 ---------- */
function copyText(text, okMsg) {
  const done = () => toast(okMsg || "已复制到剪贴板 ✅");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else { fallbackCopy(text, done); }
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { toast("请手动复制：" + text); }
  document.body.removeChild(ta);
}
function copyCode() {
  const code = (PAY_CONFIG.quark_code || "").trim();
  if (!code) { toast("未设置提取码"); return; }
  copyText(code, "提取码已复制：" + code);
}
function copyAmount() { copyText(String(amount), "金额已复制：¥" + amount); }

/* ---------- Toast ---------- */
function toast(msg) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 260); }, 2200);
}

/* ---------- 口碑墙 ---------- */
/* ------------------------------------------------------------
 * 口碑墙数据
 * ------------------------------------------------------------
 * url = 原帖链接。留空字符串 "" 时，这张卡片不可点击。
 * 下面默认填的是各平台的话题搜索页（点得开、不会 404），
 * 请换成你自己的原帖链接 —— 三个平台取链接的方法：
 *
 *  【微博】
 *    电脑：打开微博 → 地址栏形如 https://weibo.com/1234567890/PabcDEF
 *    手机：「···」→ 复制链接 → https://m.weibo.cn/detail/5012345678901234
 *
 *  【小红书】
 *    打开笔记 → 地址栏形如
 *      https://www.xiaohongshu.com/explore/65f0a1b2c3d4e5f6a7b8c9d0?xsec_token=ABxxxxxxxx&xsec_source=pc_share
 *    ⚠️ 必须连着 ?xsec_token=... 一起复制！只复制 /explore/{id} 会显示「笔记不存在」。
 *    App 内：「分享」→「复制链接」，会自动带上 token。
 *
 *  【抖音】⚠️ 抖音没有可用的第三方嵌入播放器（/light/ 返回"暂无内容"、
 *          open.douyin.com/player 返回"加载失败"，均实测无效），
 *          所以只能做「封面 + 点击跳转」。封面务必存本地（videos/douyin/），
 *          抖音图床有防盗链，外链会裂。
 *          取单条视频：浏览器打开视频 → 地址栏里的 modal_id 或 /video/{id}
 *          就是视频 ID，用 https://www.douyin.com/video/{id} 即可。
 *    分享 → 复制链接，得到短链 https://v.douyin.com/iXXXXXXX/（推荐，手机会唤起 App）
 *    或网页版地址栏 https://www.douyin.com/video/7312345678901234567
 * ------------------------------------------------------------ */
const WALL_SECTIONS = [
  {
    id: "bilibili", name: "哔哩哔哩", badge: "B", accent: "#00A1D6", tint: "rgba(0,161,214,.10)",
    items: [
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#E3F4FB", likes: 286,
        url: "https://www.bilibili.com/video/BV1xAao6nE82/",
        video: {
          title: "分段独立 LoRA / 公用 LoRA",
          duration: "03:08",
          cover: "https://i2.hdslb.com/bfs/archive/33f3539b1f7a342d8fa37d0c061d109f3e51f10f.jpg",
          embed: "https://player.bilibili.com/player.html?bvid=BV1xAao6nE82&high_quality=1&danmaku=0"
        },
        text: "Minimax H3 导演台支持每个分段独立设置 LoRA、公用 LoRA，一个全能工作流玩转音画同步、文生视频、图生视频。" },
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#E3F4FB", likes: 431,
        url: "https://www.bilibili.com/video/BV1Tquc6gERB/",
        video: {
          title: "全能工作流重磅发布",
          duration: "08:03",
          cover: "https://i1.hdslb.com/bfs/archive/e67369cc5c2ab117ea02620d69a1877d4a2a2535.jpg",
          embed: "https://player.bilibili.com/player.html?bvid=BV1Tquc6gERB&high_quality=1&danmaku=0"
        },
        text: "一个工作流玩转 Minimax：音画同步、文生视频、图生视频、首尾帧、参考图生视频，全都串在一条线上。" },
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#E3F4FB", likes: 512,
        url: "https://www.bilibili.com/video/BV1Mp8w6cEsN/",
        video: {
          title: "导演台荣获 MiniMax 官方点名",
          duration: "13:09",
          cover: "https://i0.hdslb.com/bfs/archive/e7f9e4db314dc8b39606140f2dffcd4e3fcd71e4.jpg",
          embed: "https://player.bilibili.com/player.html?bvid=BV1Mp8w6cEsN&high_quality=1&danmaku=0"
        },
        text: "荣幸之至！一切都是建立在优秀的底膜之上 —— 感谢 MiniMax 开源出这么好的模型。" },
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#E3F4FB", likes: 298,
        url: "https://www.bilibili.com/video/BV1Um8j6MEmk/",
        video: {
          title: "无限次采样工作流 · 加速版",
          duration: "03:49",
          cover: "https://i1.hdslb.com/bfs/archive/7dbc782881a9716597aeee98e5541ea64446225c.jpg",
          embed: "https://player.bilibili.com/player.html?bvid=BV1Um8j6MEmk&high_quality=1&danmaku=0"
        },
        text: "直出 2K、一次性出片。加速版把等待时间压下去之后，试错成本低了很多。" },
    ]
  },
  {
    id: "xhs", name: "小红书", badge: "书", accent: "#FF2442", tint: "rgba(255,36,66,.10)",
    items: [
      { name: "鱼辰丑占星", handle: "@鱼辰丑占星", emoji: "♌", av: "#FDECEC", likes: "",
        url: "https://www.xiaohongshu.com/discovery/item/6aa949c1000000002a02c435?source=webshare&xhsshare=pc_web&xsec_token=ABgVsO1QCVh3P7eM9J0gvxN5m3o2WL895SP7STj_W6lA8=&xsec_source=pc_share",
        text: "26年9月下半月运程 · 狮子 / 金牛 / 白羊" },
      { name: "鱼辰丑占星", handle: "@鱼辰丑占星", emoji: "♓", av: "#E8EEFB", likes: "",
        url: "https://www.xiaohongshu.com/discovery/item/6aa29489000000002603b960?source=webshare&xhsshare=pc_web&xsec_token=ABSr28ohK1IUPbK3s0cCYAv3_W6keU42YAVl0FKV1BaUA=&xsec_source=pc_share",
        text: "2026年9月双鱼座 / 水瓶座 / 摩羯座运程" },
      { name: "鱼辰丑占星", handle: "@鱼辰丑占星", emoji: "♐", av: "#FDF0E3", likes: "",
        url: "https://www.xiaohongshu.com/discovery/item/6a9aa1a8000000002b024708?source=webshare&xhsshare=pc_web&xsec_token=AB0VbXThRVw3uu-x1yzdggKPLPdsOwPVTARvHB6PjcCEg=&xsec_source=pc_share",
        text: "射手座 2026年9月运程：财务好运" },
      { name: "鱼辰丑占星", handle: "@鱼辰丑占星", emoji: "♍", av: "#E9F3EE", likes: "",
        url: "https://www.xiaohongshu.com/discovery/item/6a981a550000000028033c8f?source=webshare&xhsshare=pc_web&xsec_token=ABgQDnFjQH1ye3rGiKwmLn0apfbag6X0LLhV3gIVc-6So=&xsec_source=pc_share",
        text: "处女座 2026年9月运程：工作好运 · 财务好消息" },
    ]
  },
  {
    id: "douyin", name: "抖音", badge: "抖", accent: "#111111", tint: "rgba(17,17,17,.08)",
    items: [
      { name: "丨", handle: "@RongWei188", emoji: "📷", av: "#EAF0F6", likes: "2.0万",
        url: "https://www.douyin.com/video/7288615183864450341",
        video: {
          title: "如何走出海门岛互通！海门岛的路线指引",
          cover: "videos/douyin/7288615183864450341.jpg"
        },
        text: "#海门岛 #厦漳大桥 —— 一条实用的路线指引，2023-10-11 发布，收获 2.0 万个喜欢。" },
      { name: "丨", handle: "@RongWei188", emoji: "📷", av: "#EAF0F6", likes: "2.0万",
        url: "https://www.douyin.com/video/7415170112354782515",
        video: {
          title: "我的家乡～和溪",
          cover: "videos/douyin/7415170112354782515.jpg"
        },
        text: "2024-09-16 发布 · 收获 2.0 万个喜欢。" },
      { name: "丨", handle: "@RongWei188", emoji: "📷", av: "#EAF0F6", likes: "2.0万",
        url: "https://www.douyin.com/video/7378829177455152422",
        video: {
          title: "#航拍龙舟赛 · 有人在摸鱼😄",
          cover: "videos/douyin/7378829177455152422.jpg"
        },
        text: "#端午节 #赛龙舟 · 2024-06-10 发布 · 收获 2.0 万个喜欢。" },
      { name: "丨", handle: "@RongWei188", emoji: "📷", av: "#EAF0F6", likes: "2.0万",
        url: "https://www.douyin.com/video/7316025789877685541",
        video: {
          title: "激情岁月——漳州坦克大队年会活动",
          cover: "videos/douyin/7316025789877685541.jpg"
        },
        text: "2023-12-24 发布 · 收获 2.0 万个喜欢。" },
      { name: "丨", handle: "@RongWei188 · 抖音号", emoji: "🧭", av: "#EAF0F6", likes: "",
        url: "https://www.douyin.com/user/MS4wLjABAAAA85wTvsVX-xqRA-IDWQMgFuwGtPte1r5Finzn4ALuciIvQ7295Qs1GFIld76I2Xef",
        text: "主页一共 124 个作品，这里只挑了 4 条。想看全部（婚礼拍摄 / 路线记录），点进去逛。" },
    ]
  },
  {
    id: "works", name: "原创作品", badge: "MP4", accent: "#C0854F", tint: "rgba(192,133,79,.12)",
    items: [
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#F0E4D8", likes: 156,
        title: "AnimateDiff 动画短片 · 01",
        url: "",
        video: { src: "videos/work-01.mp4", cover: "videos/work-01.jpg", duration: "00:15", ratio: "9/16" },
        text: "目前比较满意的一条动画测试片段。不用跳转，点封面就能在卡片里直接播放。" },
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#F0E4D8", likes: 132,
        title: "AnimateDiff 动画短片 · 02",
        url: "",
        video: { src: "videos/work-02.mp4", cover: "videos/work-02.jpg", duration: "00:15", ratio: "9/16" },
        text: "同一组提示词换个种子出来的版本，动作连贯性比上一版好一些。" },
      { name: "AI搅拌手", handle: "@AI搅拌手", emoji: "🎬", av: "#F0E4D8", likes: 208,
        title: "MiniMax H3 导演台 · 2K 直出样片",
        url: "",
        video: { src: "videos/work-03.mp4", cover: "videos/work-03.jpg", duration: "00:10", ratio: "9/16" },
        text: "导演台直接生成的 2K 竖版样片。原始文件 1536×2752 / 105MB，压到 1280 高后只有 2MB。" },
    ]
  },
];

function renderWall() {
  const host = document.getElementById("wallSections");
  if (!host) return;
  host.innerHTML = WALL_SECTIONS.map(sec => `
    <div class="wall-platform">
      <div class="wall-head">
        <div class="pf">
          <span class="ic" style="background:${sec.tint};color:${sec.accent}">${sec.badge}</span>
          <span>${sec.name}</span>
        </div>
        <div class="wall-nav">
          <button type="button" aria-label="${sec.name} 上一组" onclick="wallScroll('${sec.id}',-1)">‹</button>
          <button type="button" aria-label="${sec.name} 下一组" onclick="wallScroll('${sec.id}',1)">›</button>
        </div>
      </div>
      <div class="wall-track" id="track-${sec.id}">
        ${sec.items.map(it => {
          const href = (it.url || "").trim();

          /* ---- 视频卡片：封面 + 播放按钮 ---- */
          if (it.video) {
            const v = it.video || {};
            const embed = (v.embed || "").trim();
            const src = (v.src || "").trim();
            const ratio = (v.ratio || "").trim();
            const portrait = ratio === "9/16" || ratio === "3/4";
            return `
          <article class="quote video-card${portrait ? " video-portrait" : ""}" data-embed="${embed}" data-src="${src}" data-url="${href}">
            <div class="vthumb"${ratio ? ` style="aspect-ratio:${ratio}"` : ""} role="button" tabindex="0" aria-label="播放 ${it.name} 的视频"
                 onclick="playVideo(this)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();playVideo(this)}">
              <span class="vemoji">${it.emoji}</span>${v.cover ? `<img src="${v.cover}" alt="${it.name} 的视频封面" loading="lazy" onerror="this.remove()">` : ""}
              <span class="vplay">▶</span>
              ${v.duration ? `<span class="vdur">${v.duration}</span>` : ""}
              <span class="pbadge" style="background:${sec.tint};color:${sec.accent}">${sec.name}</span>
            </div>
            ${(v.title || it.title) ? `<p class="vtitle">${v.title || it.title}</p>` : ""}
            <p class="qtext">${it.text}</p>
            <div class="qfoot">
              ${it.likes ? `<span class="likes">❤️ ${it.likes}</span>` : ""}
              ${href ? `<a class="qlink" href="${href}" target="_blank" rel="noopener noreferrer">查看原帖 →</a>`
                     : src ? `<span class="qlink muted">本站视频</span>`
                     : `<span class="qlink muted">未设置链接</span>`}
            </div>
          </article>`;
          }

          /* ---- 文字卡片：整张可点击 ---- */
          const open = href
            ? `<a class="quote" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="在新窗口打开 ${it.name} 的原帖">`
            : `<article class="quote">`;
          const close = href ? "</a>" : "</article>";
          return `${open}
            <div class="quote-top">
              <div class="qav" style="background:${it.av}">${it.emoji}</div>
              <div class="qwho"><b>${it.name}</b><span>${it.handle}</span></div>
              <span class="pbadge" style="background:${sec.tint};color:${sec.accent}">${sec.name}</span>
            </div>
            <p class="qtext">${it.text}</p>
            <div class="qfoot">
              ${it.likes ? `<span class="likes">❤️ ${it.likes}</span>` : ""}
              ${href ? `<span class="qlink">查看原帖 →</span>` : `<span class="qlink muted">未设置链接</span>`}
            </div>
          ${close}`;
        }).join("")}      </div>
    </div>`).join("");

  WALL_SECTIONS.forEach(sec => {
    const track = document.getElementById("track-" + sec.id);
    track.addEventListener("scroll", () => updateWallNav(sec.id), { passive: true });
    track.addEventListener("wheel", e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 0) return;
      const atStart = track.scrollLeft <= 1, atEnd = track.scrollLeft >= max - 1;
      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
        track.scrollLeft += e.deltaY; e.preventDefault();
      }
    }, { passive: false });
    updateWallNav(sec.id);
  });
}

function wallScroll(id, dir) {
  const track = document.getElementById("track-" + id);
  if (!track) return;
  const card = track.querySelector(".quote");
  const gap = 16;
  const step = card ? card.getBoundingClientRect().width + gap : 360;
  track.scrollBy({ left: dir * step, behavior: "smooth" });
}

/* 点击视频封面：
 *   1) 有 embed（B站 iframe 等）→ 原位换成播放器
 *   2) 有 src（自己的 mp4）    → 原位换成 <video>
 *   3) 只有 url（抖音/小红书）  → 新窗口打开原帖，和 Buy Me a Coffee 一样
 */
function playVideo(thumb) {
  const card = thumb.closest(".video-card");
  if (!card || thumb.classList.contains("playing")) return;
  let embed = (card.dataset.embed || "").trim();
  const src = card.dataset.src, url = card.dataset.url;

  // ⚠️ 协议相对地址（//player.bilibili.com）在 file:// 打开时会被解析成
  //    file://player.bilibili.com/... 直接失效，所以统一补成 https
  if (embed.indexOf("//") === 0) embed = "https:" + embed;
  if (embed.indexOf("http") !== 0 && embed !== "") embed = "https://" + embed.replace(/^\/+/, "");

  if (embed) {
    // 本地 file:// 打开时，B 站播放器会因为拿不到正常的来源而被拒绝
    if (location.protocol === "file:" && !window.__fileTipShown) {
      window.__fileTipShown = true;
      toast("本地双击打开时 B 站播放器可能被拒，建议用本地服务器访问（见说明）");
    }
    thumb.innerHTML = `<iframe src="${embed}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowfullscreen frameborder="0" scrolling="no" title="视频播放器"></iframe>`;
    const open = document.createElement("a");
    open.className = "vopen";
    open.href = url || embed; open.target = "_blank"; open.rel = "noopener noreferrer";
    open.textContent = "在 B 站打开 ↗";
    thumb.appendChild(open);
    thumb.classList.add("playing");
    thumb.removeAttribute("onclick");
    thumb.removeAttribute("tabindex");
    return;
  }
  if (src) {
    thumb.innerHTML = `<video src="${src}" controls autoplay playsinline preload="metadata"></video>`;
    thumb.classList.add("playing");
    thumb.removeAttribute("onclick");
    thumb.removeAttribute("tabindex");
    return;
  }
  if (url) { window.open(url, "_blank", "noopener"); return; }
  toast("这条视频还没有设置链接或播放器地址");
}

function updateWallNav(id) {
  const track = document.getElementById("track-" + id);
  if (!track) return;
  const nav = track.parentElement.querySelector(".wall-nav");
  if (!nav) return;
  const [prev, next] = nav.querySelectorAll("button");
  const max = track.scrollWidth - track.clientWidth - 2;
  prev.disabled = track.scrollLeft <= 1;
  next.disabled = max <= 0 || track.scrollLeft >= max;
}
/* ---------- 其他交互 ---------- */
function quickDonate() {
  const first = creators[0];
  if (!first) { toast("还没有创作者哦"); return; }
  openSheet(first.id);
}

window.addEventListener("scroll", () => {
  const hd = document.getElementById("siteHeader");
  if (hd) hd.classList.toggle("scrolled", window.scrollY > 8);
}, { passive: true });

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeSheet(); closeSuccess(); closeGuide(); }
});

const searchInputEl = document.getElementById("searchInput");
if (searchInputEl) searchInputEl.addEventListener("input", render);
const msgInputEl = document.getElementById("mMsg");
if (msgInputEl) msgInputEl.addEventListener("input", e => {
  const cnt = document.getElementById("msgCount");
  if (cnt) cnt.textContent = e.target.value.length + "/60";
});

/* ---------- 初始化 ---------- */
(function init() {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("brandName", PAY_CONFIG.site_name);
  setText("footBrand", PAY_CONFIG.site_name);
  setText("year", new Date().getFullYear());

  // 页面标题：<body data-page-title="..."> 优先
  const pageTitle = document.body.getAttribute("data-page-title");
  document.title = pageTitle || (PAY_CONFIG.site_name + " · 支持喜欢的创作者");

  renderQuickMsgs();
  renderWall();

  // 微信 / QQ 内置浏览器会拦截微博、小红书、抖音的外链
  const wallTip = document.getElementById("wallTip");
  if (wallTip && isInWeChatOrQQ()) wallTip.hidden = false;

  // 应用自定义金额按钮（仅首页有）
  const grid = document.getElementById("amountGrid");
  if (grid) {
    const customBtn = grid.querySelector('[data-v="custom"]');
    grid.innerHTML = PAY_CONFIG.amounts.map(v =>
      `<button data-v="${v}" class="${v === 20 ? "active" : ""}" onclick="pick(this)">¥${v}</button>`
    ).join("") + (customBtn ? customBtn.outerHTML : "");
  }
  render();
})();
