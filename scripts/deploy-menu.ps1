param(
  [switch]$TextMode,
  [string]$Selection,
  [switch]$DryRun,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-LocalConfigPath {
  return (Join-Path (Get-RepoRoot) 'wrangler.local.toml')
}

function Get-PublicConfigPath {
  return (Join-Path (Get-RepoRoot) 'wrangler.toml')
}

function Get-ConfigMatchValue {
  param(
    [string]$Content,
    [string]$Pattern
  )

  if ([string]::IsNullOrWhiteSpace($Content)) {
    return $null
  }

  $match = [regex]::Match($Content, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return $null
}

function Mask-Value {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return '未设置'
  }

  if ($Value.Length -le 10) {
    return ('*' * $Value.Length)
  }

  return ('{0}...{1}' -f $Value.Substring(0, 6), $Value.Substring($Value.Length - 4))
}

function Get-CanonicalHost {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $null
  }

  try {
    return ([Uri]$Url).Host
  } catch {
    return $null
  }
}

function Read-DeployConfig {
  $repoRoot = Get-RepoRoot
  $publicConfigPath = Get-PublicConfigPath
  $localConfigPath = Get-LocalConfigPath

  $publicContent = ''
  if (Test-Path $publicConfigPath) {
    $publicContent = Get-Content $publicConfigPath -Raw -Encoding UTF8
  }

  $localExists = Test-Path $localConfigPath
  $localContent = ''
  if ($localExists) {
    $localContent = Get-Content $localConfigPath -Raw -Encoding UTF8
  }

  $workerName = Get-ConfigMatchValue -Content $publicContent -Pattern '^name\s*=\s*"([^"]+)"'
  $databaseName = Get-ConfigMatchValue -Content $localContent -Pattern '^database_name\s*=\s*"([^"]+)"'
  $databaseId = Get-ConfigMatchValue -Content $localContent -Pattern '^database_id\s*=\s*"([^"]+)"'
  $publicBaseUrl = Get-ConfigMatchValue -Content $localContent -Pattern '^PUBLIC_BASE_URL\s*=\s*"([^"]+)"'
  $adminPanelUrl = Get-ConfigMatchValue -Content $localContent -Pattern '^ADMIN_PANEL_URL\s*=\s*"([^"]+)"'
  $canonicalHost = Get-CanonicalHost -Url $adminPanelUrl

  return [pscustomobject]@{
    RepoRoot = $repoRoot
    WorkerName = $(if ($workerName) { $workerName } else { '未识别' })
    LocalConfigExists = $localExists
    LocalConfigPath = $localConfigPath
    PublicBaseUrl = $publicBaseUrl
    AdminPanelUrl = $adminPanelUrl
    CanonicalHost = $canonicalHost
    PagesProjectName = $(if ($env:PAGES_PROJECT_NAME) { $env:PAGES_PROJECT_NAME } else { 'tg-admin-panel' })
    PagesBranch = $(if ($env:CF_PAGES_BRANCH) { $env:CF_PAGES_BRANCH } else { 'production' })
    DatabaseName = $databaseName
    DatabaseId = $databaseId
  }
}

function Show-ConfigSummary {
  param([object]$Config)

  Write-Host ''
  Write-Host '当前部署配置' -ForegroundColor Cyan
  Write-Host ('-' * 44)
  Write-Host ("仓库目录      : {0}" -f $Config.RepoRoot)
  Write-Host ("Worker 名称    : {0}" -f $Config.WorkerName)
  Write-Host ("私有配置文件  : {0}" -f $(if ($Config.LocalConfigExists) { '已找到' } else { '未找到' }))
  Write-Host ("Worker 地址    : {0}" -f $(if ($Config.PublicBaseUrl) { $Config.PublicBaseUrl } else { '未设置' }))
  Write-Host ("面板地址       : {0}" -f $(if ($Config.AdminPanelUrl) { $Config.AdminPanelUrl } else { '未设置' }))
  Write-Host ("Pages 项目     : {0}" -f $Config.PagesProjectName)
  Write-Host ("Pages 分支     : {0}" -f $Config.PagesBranch)
  Write-Host ("D1 数据库      : {0}" -f $(if ($Config.DatabaseName) { $Config.DatabaseName } else { '未设置' }))
  Write-Host ("D1 数据库 ID   : {0}" -f (Mask-Value $Config.DatabaseId))
  Write-Host ''
}

function Invoke-RepoCommand {
  param(
    [string]$Title,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  Write-Host ''
  Write-Host ("[{0}]" -f $Title) -ForegroundColor Yellow
  Write-Host (("> {0} {1}") -f $FilePath, ($Arguments -join ' ')) -ForegroundColor DarkGray

  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw ("执行失败：{0}" -f $Title)
    }
  } finally {
    Pop-Location
  }
}

function Ensure-LocalConfigExists {
  param([object]$Config)

  if (-not $Config.LocalConfigExists) {
    throw '未找到 wrangler.local.toml，请先复制 wrangler.local.example.toml 并填写私有配置。'
  }
}

function Invoke-MergeConfig {
  param([object]$Config)

  Ensure-LocalConfigExists -Config $Config
  Invoke-RepoCommand -Title '生成私有 Wrangler 配置' -FilePath 'node' -Arguments @('scripts/merge-wrangler-config.mjs') -WorkingDirectory $Config.RepoRoot
}

function Invoke-SetupD1 {
  param([object]$Config)

  Ensure-LocalConfigExists -Config $Config
  Invoke-MergeConfig -Config $Config
  Invoke-RepoCommand -Title '初始化或升级 D1' -FilePath 'npm' -Arguments @('run', 'setup:d1') -WorkingDirectory $Config.RepoRoot
}

function Invoke-DeployWorker {
  param([object]$Config)

  Ensure-LocalConfigExists -Config $Config

  if ($DryRun) {
    Invoke-MergeConfig -Config $Config
    Invoke-RepoCommand -Title 'Worker 预演部署' -FilePath 'npx' -Arguments @('wrangler', 'deploy', '--dry-run', '--config', '.wrangler.private.toml') -WorkingDirectory $Config.RepoRoot
    return
  }

  Invoke-RepoCommand -Title '部署私有 Worker' -FilePath 'npm' -Arguments @('run', 'deploy:private') -WorkingDirectory $Config.RepoRoot
}

function Invoke-DeployPanel {
  param([object]$Config)

  if ([string]::IsNullOrWhiteSpace($Config.PublicBaseUrl)) {
    throw '未在 wrangler.local.toml 中找到 PUBLIC_BASE_URL，无法部署 Pages 面板。'
  }

  $arguments = @(
    'scripts/deploy-admin-panel.mjs',
    '--project-name', $Config.PagesProjectName,
    '--worker-base-url', $Config.PublicBaseUrl,
    '--branch', $Config.PagesBranch
  )

  if (-not [string]::IsNullOrWhiteSpace($Config.CanonicalHost)) {
    $arguments += @('--canonical-host', $Config.CanonicalHost)
  }

  if ($DryRun) {
    $arguments += '--dry-run'
  }

  Invoke-RepoCommand -Title '部署 Pages 面板' -FilePath 'node' -Arguments $arguments -WorkingDirectory $Config.RepoRoot
}

function Invoke-DeployAll {
  param([object]$Config)

  Invoke-DeployWorker -Config $Config
  Invoke-DeployPanel -Config $Config
}

function Get-MenuItems {
  return @(
    [pscustomobject]@{ Key = 'show-config'; Label = '查看当前配置'; Description = '显示本地私有配置、Pages 与 D1 摘要' },
    [pscustomobject]@{ Key = 'merge-config'; Label = '生成私有配置'; Description = '合并 wrangler.toml 与 wrangler.local.toml' },
    [pscustomobject]@{ Key = 'setup-d1'; Label = '初始化 D1'; Description = '执行 D1 迁移，适合首次启用历史消息' },
    [pscustomobject]@{ Key = 'deploy-worker'; Label = '部署 Worker'; Description = '部署当前私有 Worker 配置到 Cloudflare' },
    [pscustomobject]@{ Key = 'deploy-panel'; Label = '部署面板'; Description = '部署 Pages 后台面板到 production 分支' },
    [pscustomobject]@{ Key = 'deploy-all'; Label = '一键部署全部'; Description = '依次部署 Worker 与 Pages 面板' },
    [pscustomobject]@{ Key = 'exit'; Label = '退出'; Description = '关闭脚本' }
  )
}

function Select-MenuItemGui {
  $items = Get-MenuItems
  if (-not (Get-Command Out-GridView -ErrorAction SilentlyContinue)) {
    return $null
  }

  $title = if ($DryRun) { 'TG 部署菜单（预演模式）' } else { 'TG 部署菜单' }
  $selected = $items | Select-Object Label, Description, Key | Out-GridView -Title $title -PassThru
  if ($null -eq $selected) {
    return 'exit'
  }

  return $selected.Key
}

function Select-MenuItemText {
  $items = Get-MenuItems

  Write-Host ''
  Write-Host 'TG 双向聊天部署菜单' -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host '当前模式：Dry Run（只预演，不实际部署）' -ForegroundColor Yellow
  }
  Write-Host ('-' * 44)

  for ($index = 0; $index -lt $items.Count; $index += 1) {
    Write-Host (("{0}. {1}") -f ($index + 1), $items[$index].Label)
  }

  $inputValue = Read-Host '请输入序号'
  $parsedChoice = 0
  if (-not [int]::TryParse($inputValue, [ref]$parsedChoice)) {
    throw '输入无效，请输入菜单序号。'
  }

  if ($parsedChoice -lt 1 -or $parsedChoice -gt $items.Count) {
    throw '输入超出范围，请重新选择。'
  }

  return $items[$parsedChoice - 1].Key
}

function Pause-IfNeeded {
  if (-not $NoPause) {
    Write-Host ''
    [void](Read-Host '按回车继续')
  }
}

function Invoke-SelectedAction {
  param(
    [string]$Action,
    [object]$Config
  )

  switch ($Action) {
    'show-config' { Show-ConfigSummary -Config $Config; return $true }
    'merge-config' { Invoke-MergeConfig -Config $Config; return $true }
    'setup-d1' { Invoke-SetupD1 -Config $Config; return $true }
    'deploy-worker' { Invoke-DeployWorker -Config $Config; return $true }
    'deploy-panel' { Invoke-DeployPanel -Config $Config; return $true }
    'deploy-all' { Invoke-DeployAll -Config $Config; return $true }
    'exit' { return $false }
    default { throw ('未知操作：{0}' -f $Action) }
  }
}

function Main {
  while ($true) {
    $config = Read-DeployConfig
    $action = $Selection

    if ([string]::IsNullOrWhiteSpace($action)) {
      if (-not $TextMode) {
        $action = Select-MenuItemGui
      }

      if ([string]::IsNullOrWhiteSpace($action)) {
        $action = Select-MenuItemText
      }
    }

    $shouldContinue = Invoke-SelectedAction -Action $action -Config $config
    if (-not $shouldContinue) {
      break
    }

    if (-not [string]::IsNullOrWhiteSpace($Selection)) {
      break
    }

    Pause-IfNeeded
  }
}

try {
  Main
} catch {
  Write-Host ''
  Write-Host (('执行失败：{0}') -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}
