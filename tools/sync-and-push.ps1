# 定时同步作者最新视频 → 提交 → 推送
# 由 Windows 计划任务调用（见 README 的「本机定时同步」一节）
#
# 为什么要在本机跑：
#   B站风控按 IP 段限流，GitHub runner 和 Cloudflare 机房 IP 都会被 412，
#   只有住宅宽带 IP 能稳定调用。所以定时抓取放在你自己的电脑上最可靠。

$ErrorActionPreference = 'Continue'
$site = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $site 'sync.log'
$safe = $site -replace '\\', '/'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  $line | Tee-Object -FilePath $log -Append
}

Log '=== 开始同步 ==='
Set-Location $site

# 1) 抓取
$out = & node tools/fetch-feeds.mjs 2>&1
$out | ForEach-Object { Log ('  ' + $_) }
if ($LASTEXITCODE -ne 0) { Log "抓取脚本异常退出 ($LASTEXITCODE)"; exit 1 }

# 2) 有变化才提交
& git -c "safe.directory=$safe" -C $site add data videos/bilibili 2>&1 | Out-Null
$staged = & git -c "safe.directory=$safe" -C $site diff --staged --name-only
if (-not $staged) { Log '没有新变化，结束'; exit 0 }

Log ('变更文件: ' + ($staged -join ', '))
& git -c "safe.directory=$safe" -C $site commit -q -m "chore: 本机定时同步作者最新视频" 2>&1 | ForEach-Object { Log ('  ' + $_) }
& git -c "safe.directory=$safe" -C $site pull --rebase --autostash origin main 2>&1 | ForEach-Object { Log ('  ' + $_) }
& git -c "safe.directory=$safe" -C $site push origin main 2>&1 | ForEach-Object { Log ('  ' + $_) }
Log "推送完成 (exit=$LASTEXITCODE)"
Log '=== 同步结束 ==='