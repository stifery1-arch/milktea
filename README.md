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

**改站名 / 收款码 / 网盘链接** —— 打开 `app.js`，最上面的 `PAY_CONFIG`：

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

## 平台限制（实测结论）

- **B站**：可以 iframe 内嵌播放 ✅（播放器地址不能写 `//` 开头，必须带 `https:`）
- **抖音**：无法内嵌 —— `/light/{id}` 返回「暂无内容」，`open.douyin.com/player` 返回「加载失败」。只能封面 + 跳转
- **小红书**：无法内嵌，且链接必须带 `?xsec_token=...`，否则提示「笔记不存在」。该 token 有有效期，过期需重新复制分享链接

## 部署

推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动发布到 GitHub Pages。
首次运行会自动开启 Pages；若未生效，手动到 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 注意

- 站点是纯静态的，所有路径都是相对路径，放在子目录（`用户名.github.io/仓库名/`）也能正常工作
- `videos/` 里的 mp4 建议压到 3MB 以内（仓库里用的是 H.264 + CRF 28 + `-movflags +faststart`）