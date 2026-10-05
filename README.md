# 请我喝杯奶茶 · 创作者打赏站

一个纯静态的创作者打赏页 + 口碑墙，手机 / 电脑自适应，无需后端。

## 页面

| 文件 | 说明 |
| --- | --- |
| `index.html` | 首页：首屏、创作者列表、打赏流程、常见问题 |
| `wall.html` | 口碑墙：哔哩哔哩 / 小红书 / 抖音 / 原创作品 四个分组 |
| `styles.css` | 全站样式（设计令牌 + 响应式） |
| `app.js` | 全站逻辑 + **所有内容数据** |
| `videos/` | 本地视频与封面图 |

## 常见修改

**支付方式有两种** —— 打开 `app.js` 最上面的 `PAY_CONFIG`：

- **收款码模式**（默认）：`pay_link` 留空 `""`，页面显示微信 / 支付宝收款码图片
- **免扫码模式**：`pay_link` 填一个支付链接（微信支付 H5、或第三方聚合支付给的收款链接），
  页面会隐藏二维码，改成绿色「打开微信完成支付」按钮，点了直接跳转

> ⚠️ 微信支付官方 H5 需要**商户号 + 后端签名 + 已备案域名**，`github.io` 无法备案，所以纯静态站点走不通官方直连。要么用第三方聚合支付拿现成链接，要么自建后端 + 自己的域名。

**改站名 / 收款码 / 网盘链接** —— 同一个 `PAY_CONFIG`：

```js
const PAY_CONFIG = {
  wechat_qr: "1.png",          // 微信收款码，放到仓库根目录
  alipay_qr: "alipay_qr.jpg",  // 支付宝收款码
  quark_url: "https://pan.quark.cn/s/xxxx",
  quark_code: "1234",          // 没有就填 ""
  site_name: "请我喝杯奶茶",
  amounts: [5, 10, 20, 35, 68],
};
```

**改口碑墙内容** —— 同一个 `app.js` 里的 `WALL_SECTIONS` 数组，按分组增删条目即可。
条目支持三种形态：

```js
// ① 纯文字卡（整张可点击）
{ name: "作者", handle: "@账号", emoji: "📷", av: "#EAF0F6", likes: "2.0万",
  url: "https://原帖地址", text: "一句话说明" },

// ② 视频卡 · 内嵌播放（B站 / 本地 mp4）
{ name: "作者", handle: "@账号", emoji: "🎬", av: "#E3F4FB", likes: 286,
  url: "https://www.bilibili.com/video/BVxxxx/",
  video: { title: "视频标题", duration: "03:08", cover: "封面图地址或本地路径",
           embed: "https://player.bilibili.com/player.html?bvid=BVxxxx" },
  text: "说明" },

// ③ 视频卡 · 封面 + 跳转（抖音 / 小红书，平台不支持内嵌）
{ name: "作者", handle: "@账号", emoji: "📷", av: "#EAF0F6", likes: "2.0万",
  url: "https://原帖地址",
  video: { title: "标题", cover: "videos/douyin/xxx.jpg", ratio: "16/9" },
  text: "说明" },
```

- `video.embed` —— 内嵌播放器地址，留空则点封面跳转 `url`
- `video.src` —— 本地视频路径，留空则用 `embed`
- `video.ratio` —— 竖版用 `"9/16"`（会自动收窄卡片），横版留空即 16:9
- `likes` —— 留空 `""` 则不显示爱心

## 作者新视频自动同步

`wall.html` 会读取 `data/bilibili.json`，把作者**最新发布**的视频自动插到「哔哩哔哩」分组最前面（带红色 `NEW` 角标），已手工列出的不会重复。

这个 JSON 由 `.github/workflows/pages.yml` 在**每次部署前**运行 `tools/fetch-feeds.mjs` 生成：

- 触发时机：推送到 main / **每小时定时** / 手动运行
- 产物（JSON + 封面图）**只进入本次发布的产物，不提交回仓库**，所以仓库不会膨胀
- 抓取失败时保留原有内容，不会把站点搞坏

**为什么不用浏览器实时抓？** B 站接口不带 CORS 头（浏览器 fetch 必被拦），而且风控会返回 `412` / `code=-799 请求过于频繁`。所以只能在构建时由服务端抓，写成同源 JSON。

**抖音 / 小红书无法自动同步**（已实测）：

| 平台 | 原因 |
| --- | --- |
| 抖音 | 没有公开接口；作者主页需要登录态，未登录时作品网格根本不加载 |
| 小红书 | 按 IP 封锁（`300012 IP存在风险`）；且链接的 `xsec_token` 会过期 |

要加新作者：在 `tools/fetch-feeds.mjs` 的 `AUTHORS` 数组里加一条 `{ mid, name, keep }`（`mid` 是 B 站 UID，在空间页地址栏里）。

## 更新机制（三层）

作者新视频的同步有三层保障，越靠前越实时：

**① 本机定时同步（主要，每天 09:00）**

Windows 计划任务 `MilkteaSync` 每天 09:00 运行 `tools/sync-and-push.ps1`（电脑关机时会顺延到下次开机补跑）：
抓取 → 有变化就提交 → 推送。推送会触发 CI，自动部署到两个站点。

> **为什么必须在你的电脑上跑？**
> B站风控是**按 IP 段**限流的。实测：
> - GitHub Actions runner（Azure）→ `412` / `code=-799`
> - Cloudflare 边缘节点 → 同样 `412`
> - **你的家庭宽带 IP → 正常** ✅
>
> 所以定时抓取放在本机最可靠。

管理命令：
```powershell
Get-ScheduledTask -TaskName MilkteaSync                    # 查看状态
Start-ScheduledTask -TaskName MilkteaSync                  # 手动跑一次
Unregister-ScheduledTask -TaskName MilkteaSync -Confirm:$false   # 卸载
Get-Content .\sync.log -Tail 30                            # 看日志
```

**② Cloudflare Pages Function（`/api/bilibili`）**

页面优先请求这个接口，它带 6 小时边缘缓存（缓存过期后第一个访客触发刷新，不需要 cron）。
抓取同样是三级降级：空间接口 → 详情接口 → 站点静态 JSON。
在机房 IP 被 B站拦截时，它会自动退回静态数据，不会让页面开天窗。

**③ 构建时抓取**

CI 每次运行都会跑 `tools/fetch-feeds.mjs`，结果提交回仓库作为兜底数据。

## 平台限制（实测结论）

- **B站**：可以 iframe 内嵌播放 ✅（播放器地址不能写 `//` 开头，必须带 `https:`）
- **抖音**：无法内嵌 —— `/light/{id}` 返回「暂无内容」，`open.douyin.com/player` 返回「加载失败」。只能封面 + 跳转
- **小红书**：无法内嵌，且链接必须带 `?xsec_token=...`，否则提示「笔记不存在」。该 token 有有效期，过期需重新复制分享链接

## 部署

推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动发布到 GitHub Pages。
首次运行会自动开启 Pages；若未生效，手动到 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 部署到 Cloudflare Pages

仓库已内置 Cloudflare Pages 所需的构建配置：

| 配置项 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node 版本 | 20（由 `.nvmrc` 指定） |

`npm run build` 会先跑 `tools/fetch-feeds.mjs` 同步作者最新视频，
再用 `tools/build-site.mjs` 把要发布的文件（含 `videos/`、`data/`）复制到 `dist/`。
构建脚本不会把 `.git` / `.github` / `tools` 暴露成公开文件。

**为什么不用仓库根目录当输出？** 那会把 `.git` 也发布出去。

定时更新有三种方式（任选）：

1. **推送到 main** —— 自动构建
2. **GitHub Actions 定时任务** —— 每小时的 workflow 会抓取并提交 `data/`，进而触发 Pages 重新构建
3. **Cloudflare Deploy Hook + Cron Worker** —— 若需要不依赖 GitHub 的定时重建

> ⚠️ Cloudflare Pages 免费版每月 500 次构建。如果配了定时重建，建议每天 1 次（约 30 次/月），不要设成每小时。

## 注意

## 注意

- 站点是纯静态的，所有路径都是相对路径，放在子目录（`用户名.github.io/仓库名/`）也能正常工作
- `videos/` 里的 mp4 建议压到 3MB 以内（仓库里用的是 H.264 + CRF 28 + `-movflags +faststart`）