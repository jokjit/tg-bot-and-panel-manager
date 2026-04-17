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

function Get-WizardSecretsPath {
  return (Join-Path (Get-RepoRoot) '.deploy-wizard.secrets.json')
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

  return (($Value.Substring(0, 6)) + '...' + ($Value.Substring($Value.Length - 4)))
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

function Invoke-RepoCommand {
  param(
    [string]$Title,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  Write-Host ''
  Write-Host ('[' + $Title + ']') -ForegroundColor Yellow
  Write-Host ('> ' + $FilePath + ' ' + ($Arguments -join ' ')) -ForegroundColor DarkGray

  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw ('执行失败：' + $Title)
    }
  }
  finally {
    Pop-Location
  }
}

function Get-WhoAmIInfo {
  try {
    $raw = & npx wrangler whoami --json 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
      return $null
    }
    return ($raw | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-WorkersDevSubdomain {
  if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
    return $null
  }

  $who = Get-WhoAmIInfo
  if ($null -eq $who -or -not $who.accounts -or $who.accounts.Count -eq 0) {
    return $null
  }

  $accountId = $who.accounts[0].id
  if ([string]::IsNullOrWhiteSpace($accountId)) {
    return $null
  }

  try {
    $headers = @{ Authorization = ('Bearer ' + $env:CLOUDFLARE_API_TOKEN) }
    $uri = 'https://api.cloudflare.com/client/v4/accounts/' + $accountId + '/workers/subdomain'
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    return $response.result.subdomain
  } catch {
    return $null
  }
}

function Get-WorkerNameFromPublicConfig {
  $path = Get-PublicConfigPath
  if (-not (Test-Path $path)) {
    return $null
  }

  $content = Get-Content $path -Raw -Encoding UTF8
  return (Get-ConfigMatchValue -Content $content -Pattern '^name\s*=\s*"([^"]+)"')
}

function Get-WorkersDevUrlGuess {
  $workerName = Get-WorkerNameFromPublicConfig
  $subdomain = Get-WorkersDevSubdomain
  if ([string]::IsNullOrWhiteSpace($workerName) -or [string]::IsNullOrWhiteSpace($subdomain)) {
    return $null
  }

  return ('https://' + $workerName + '.' + $subdomain + '.workers.dev')
}

function Read-WizardSecrets {
  $path = Get-WizardSecretsPath
  if (-not (Test-Path $path)) {
    return @{}
  }

  try {
    return (Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable)
  } catch {
    return @{}
  }
}

function Save-WizardSecrets {
  param([hashtable]$Secrets)

  $path = Get-WizardSecretsPath
  $json = ($Secrets | ConvertTo-Json -Depth 5)
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $json, $utf8Bom)
}

function Ensure-LocalConfigExists {
  param([object]$Config)

  if ($Config.LocalConfigExists) {
    return
  }

  $examplePath = Join-Path $Config.RepoRoot 'wrangler.local.example.toml'
  if (-not (Test-Path $examplePath)) {
    throw '未找到 wrangler.local.example.toml，无法创建本地私有配置。'
  }

  Copy-Item -LiteralPath $examplePath -Destination $Config.LocalConfigPath -Force
}

function Set-OrAddTomlVar {
  param(
    [string]$Content,
    [string]$Key,
    [string]$Value
  )

  $line = $Key + ' = "' + $Value + '"'
  $items = New-Object System.Collections.Generic.List[string]
  foreach ($entry in ($Content -split "`r?`n")) {
    [void]$items.Add($entry)
  }

  $varsIndex = -1
  for ($i = 0; $i -lt $items.Count; $i += 1) {
    if ($items[$i].Trim() -eq '[vars]') {
      $varsIndex = $i
      break
    }
  }

  if ($varsIndex -ge 0) {
    for ($i = $varsIndex + 1; $i -lt $items.Count; $i += 1) {
      $trimmed = $items[$i].Trim()
      if ($trimmed.StartsWith('[')) {
        $items.Insert($i, $line)
        return (($items -join "`r`n").TrimEnd("`r", "`n") + "`r`n")
      }

      if ($trimmed.StartsWith($Key + ' =')) {
        $items[$i] = $line
        return (($items -join "`r`n").TrimEnd("`r", "`n") + "`r`n")
      }
    }

    [void]$items.Add($line)
    return (($items -join "`r`n").TrimEnd("`r", "`n") + "`r`n")
  }

  $trimmedContent = $Content.TrimEnd("`r", "`n")
  if ([string]::IsNullOrWhiteSpace($trimmedContent)) {
    return ('[vars]' + "`r`n" + $line + "`r`n")
  }

  return ($trimmedContent + "`r`n`r`n[vars]`r`n" + $line + "`r`n")
}

function Update-LocalConfigVars {
  param(
    [object]$Config,
    [hashtable]$Vars
  )

  Ensure-LocalConfigExists -Config $Config
  $path = $Config.LocalConfigPath
  $content = Get-Content $path -Raw -Encoding UTF8
  foreach ($key in $Vars.Keys) {
    $value = [string]$Vars[$key]
    $content = Set-OrAddTomlVar -Content $content -Key $key -Value $value
  }
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
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
  $wizardSecrets = Read-WizardSecrets
  $who = Get-WhoAmIInfo

  return [pscustomobject]@{
    RepoRoot = $repoRoot
    WorkerName = $(if ($workerName) { $workerName } else { '未识别' })
    LocalConfigExists = $localExists
    LocalConfigPath = $localConfigPath
    PublicBaseUrl = $publicBaseUrl
    AdminPanelUrl = $adminPanelUrl
    CanonicalHost = Get-CanonicalHost -Url $adminPanelUrl
    PagesProjectName = $(if ($env:PAGES_PROJECT_NAME) { $env:PAGES_PROJECT_NAME } else { 'tg-admin-panel' })
    PagesBranch = $(if ($env:CF_PAGES_BRANCH) { $env:CF_PAGES_BRANCH } else { 'production' })
    DatabaseName = $databaseName
    DatabaseId = $databaseId
    WizardSecrets = $wizardSecrets
    WranglerLoggedIn = [bool]($who -and $who.loggedIn)
    WranglerAccountEmail = $(if ($who -and $who.email) { $who.email } else { $null })
    WorkersDevGuess = Get-WorkersDevUrlGuess
  }
}

function Show-ConfigSummary {
  param([object]$Config)

  Write-Host ''
  Write-Host '当前部署配置' -ForegroundColor Cyan
  Write-Host ('-' * 48)
  Write-Host ('仓库目录        : ' + $Config.RepoRoot)
  Write-Host ('Worker 名称      : ' + $Config.WorkerName)
  Write-Host ('Wrangler 登录    : ' + $(if ($Config.WranglerLoggedIn) { '已登录' } else { '未检测到' }))
  Write-Host ('Cloudflare 账号  : ' + $(if ($Config.WranglerAccountEmail) { $Config.WranglerAccountEmail } else { '未知' }))
  Write-Host ('私有配置文件    : ' + $(if ($Config.LocalConfigExists) { '已找到' } else { '未找到' }))
  Write-Host ('Worker 地址      : ' + $(if ($Config.PublicBaseUrl) { $Config.PublicBaseUrl } else { '未设置' }))
  Write-Host ('面板地址         : ' + $(if ($Config.AdminPanelUrl) { $Config.AdminPanelUrl } else { '未设置' }))
  Write-Host ('workers.dev 猜测 : ' + $(if ($Config.WorkersDevGuess) { $Config.WorkersDevGuess } else { '不可用' }))
  Write-Host ('Pages 项目       : ' + $Config.PagesProjectName)
  Write-Host ('Pages 分支       : ' + $Config.PagesBranch)
  Write-Host ('D1 数据库        : ' + $(if ($Config.DatabaseName) { $Config.DatabaseName } else { '未设置' }))
  Write-Host ('D1 数据库 ID     : ' + (Mask-Value $Config.DatabaseId))
  Write-Host ('BOT_TOKEN 缓存    : ' + $(if ($Config.WizardSecrets.BOT_TOKEN) { '已保存本地向导缓存' } else { '未保存' }))
  Write-Host ('ADMIN_CHAT_ID 缓存: ' + $(if ($Config.WizardSecrets.ADMIN_CHAT_ID) { $Config.WizardSecrets.ADMIN_CHAT_ID } else { '未保存' }))
  Write-Host ''
}

function Get-YesNo {
  param(
    [string]$Prompt,
    [bool]$Default = $true
  )

  $suffix = if ($Default) { '[Y/n]' } else { '[y/N]' }
  $value = Read-Host ($Prompt + ' ' + $suffix)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return @('y', 'yes', '1', 'true') -contains $value.Trim().ToLowerInvariant()
}

function Read-RequiredInput {
  param(
    [string]$Prompt,
    [string]$DefaultValue
  )

  while ($true) {
    $fullPrompt = if ([string]::IsNullOrWhiteSpace($DefaultValue)) { $Prompt } else { ($Prompt + ' [' + $DefaultValue + ']') }
    $value = Read-Host $fullPrompt
    if ([string]::IsNullOrWhiteSpace($value)) {
      if (-not [string]::IsNullOrWhiteSpace($DefaultValue)) {
        return $DefaultValue
      }
      Write-Host '此项不能为空，请重新输入。' -ForegroundColor Yellow
      continue
    }
    return $value.Trim()
  }
}

function Read-OptionalInput {
  param(
    [string]$Prompt,
    [string]$DefaultValue
  )

  $fullPrompt = if ([string]::IsNullOrWhiteSpace($DefaultValue)) { $Prompt } else { ($Prompt + ' [' + $DefaultValue + ']') }
  $value = Read-Host $fullPrompt
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }
  return $value.Trim()
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

  $arguments = @('run', 'setup:d1')
  if ($DryRun) {
    $arguments += '--'
    $arguments += '--dry-run'
  }

  Invoke-RepoCommand -Title '初始化或升级 D1' -FilePath 'npm' -Arguments $arguments -WorkingDirectory $Config.RepoRoot
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

  $arguments = @('scripts/deploy-admin-panel.mjs', '--project-name', $Config.PagesProjectName, '--worker-base-url', $Config.PublicBaseUrl, '--branch', $Config.PagesBranch)
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

function Set-WorkerSecrets {
  param(
    [object]$Config,
    [hashtable]$Secrets
  )

  foreach ($key in $Secrets.Keys) {
    $value = [string]$Secrets[$key]
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }

    Write-Host ''
    Write-Host ('[写入 Worker Secret] ' + $key) -ForegroundColor Yellow
    if ($DryRun) {
      Write-Host ('> npx wrangler secret put ' + $key + ' --config .wrangler.private.toml') -ForegroundColor DarkGray
      continue
    }

    Push-Location $Config.RepoRoot
    try {
      $value | npx wrangler secret put $key --config .wrangler.private.toml
      if ($LASTEXITCODE -ne 0) {
        throw ('写入 Secret 失败：' + $key)
      }
    }
    finally {
      Pop-Location
    }
  }
}

function Invoke-FirstDeployWizard {
  param([object]$Config)

  Write-Host ''
  Write-Host '首次部署向导' -ForegroundColor Cyan
  Write-Host ('=' * 48)

  if (-not $Config.WranglerLoggedIn -and [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
    throw '未检测到 Wrangler 登录状态，也未设置 CLOUDFLARE_API_TOKEN。请先执行 npx wrangler login。'
  }

  Ensure-LocalConfigExists -Config $Config

  $botTokenDefault = [string]$Config.WizardSecrets.BOT_TOKEN
  $adminChatIdDefault = [string]$Config.WizardSecrets.ADMIN_CHAT_ID

  Write-Host '步骤 1/5：填写基础地址' -ForegroundColor Green
  Write-Host '提示：这两项都可回车跳过，后续使用 Cloudflare 默认分配域名。' -ForegroundColor DarkYellow
  $publicBaseUrl = Read-OptionalInput -Prompt '请输入 Worker 自定义地址（示例：https://your-worker.example.com，回车跳过使用默认 workers.dev 域名）' -DefaultValue ''
  $adminPanelUrl = Read-OptionalInput -Prompt '请输入 Pages 面板地址（示例：https://tg-admin.example.com，回车跳过使用 Pages 默认分配域名）' -DefaultValue ''

  Write-Host ''
  Write-Host '步骤 2/5：填写 Telegram 必要参数' -ForegroundColor Green
  $botToken = Read-RequiredInput -Prompt '请输入 BOT_TOKEN' -DefaultValue $botTokenDefault
  $adminChatId = Read-RequiredInput -Prompt '请输入 ADMIN_CHAT_ID' -DefaultValue $adminChatIdDefault

  Write-Host ''
  Write-Host '步骤 3/5：写入本地私有配置' -ForegroundColor Green
  Update-LocalConfigVars -Config $Config -Vars @{ PUBLIC_BASE_URL = $publicBaseUrl; ADMIN_PANEL_URL = $adminPanelUrl }
  $savedSecrets = Read-WizardSecrets
  $savedSecrets.BOT_TOKEN = $botToken
  $savedSecrets.ADMIN_CHAT_ID = $adminChatId
  Save-WizardSecrets -Secrets $savedSecrets
  Write-Host '已更新 wrangler.local.toml，并缓存必要 Telegram 参数到本地向导文件。' -ForegroundColor DarkGreen

  $refresh = Read-DeployConfig

  Write-Host ''
  Write-Host '步骤 4/5：是否初始化 D1 历史消息数据库' -ForegroundColor Green
  if (Get-YesNo -Prompt '是否现在创建并迁移 D1 数据库？' -Default $true) {
    Invoke-SetupD1 -Config $refresh
    $refresh = Read-DeployConfig
  } else {
    Write-Host '已跳过 D1 初始化。后续可在菜单中单独执行。' -ForegroundColor Yellow
  }

  Write-Host ''
  Write-Host '步骤 5/5：部署并写入必要 Secret' -ForegroundColor Green
  Invoke-MergeConfig -Config $refresh
  if (Get-YesNo -Prompt '是否把 BOT_TOKEN 和 ADMIN_CHAT_ID 写入 Worker Secret？' -Default $true) {
    Set-WorkerSecrets -Config $refresh -Secrets @{ BOT_TOKEN = $botToken; ADMIN_CHAT_ID = $adminChatId }
  }

  if (Get-YesNo -Prompt '是否现在一键部署 Worker 与 Pages 面板？' -Default $true) {
    Invoke-DeployAll -Config (Read-DeployConfig)
  } else {
    Write-Host '已跳过正式部署，你可以稍后从菜单中单独执行。' -ForegroundColor Yellow
  }

  Write-Host ''
  Write-Host '首次部署向导完成。' -ForegroundColor Green
}

function Get-MenuItems {
  return @(
    [pscustomobject]@{ Key = 'first-deploy'; Label = '首次部署向导'; Description = '自动检查并引导完成首次配置、D1、Secret 与部署' },
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
  Write-Host ('-' * 48)

  for ($index = 0; $index -lt $items.Count; $index += 1) {
    Write-Host (($index + 1).ToString() + '. ' + $items[$index].Label)
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
    'first-deploy' { Invoke-FirstDeployWizard -Config $Config; return $true }
    'show-config' { Show-ConfigSummary -Config $Config; return $true }
    'merge-config' { Invoke-MergeConfig -Config $Config; return $true }
    'setup-d1' { Invoke-SetupD1 -Config $Config; return $true }
    'deploy-worker' { Invoke-DeployWorker -Config $Config; return $true }
    'deploy-panel' { Invoke-DeployPanel -Config $Config; return $true }
    'deploy-all' { Invoke-DeployAll -Config $Config; return $true }
    'exit' { return $false }
    default { throw ('未知操作：' + $Action) }
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
  Write-Host ('执行失败：' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}