#!/usr/bin/env pwsh
<#
.SYNOPSIS
  특정 GitHub 계정으로 git push 실행.
  현재 remote URL 에서 사용자명 부분만 갈아끼우고 push → 원상복구.

.DESCRIPTION
  Windows 자격 증명 관리자에 여러 GitHub 계정 credential 이 캐시된 상황에서,
  원하는 계정으로 push 하려 할 때 사용. 각 URL 마다 다른 계정 credential 이 매치됨.

.PARAMETER User
  push 에 사용할 GitHub username (org 권한 있는 계정)

.PARAMETER Branch
  push 할 브랜치 (기본: 현재 브랜치)

.PARAMETER Remote
  대상 remote (기본: origin)

.PARAMETER Force
  --force-with-lease 로 push (안전 강제)

.EXAMPLE
  .\scripts\push-as.ps1 -User YogiboKorea

.EXAMPLE
  .\scripts\push-as.ps1 -User YogiboKorea -Branch feature/x -Force

.NOTES
  캐시된 credential 이 없으면 push 도중 GitHub 로그인 창이 뜸.
  자격 증명 관리자에서 확인: cmdkey /list | findstr git
#>
param(
  [Parameter(Mandatory = $true)][string]$User,
  [string]$Branch = '',
  [string]$Remote = 'origin',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# 현재 remote URL 얻기
$originalUrl = git remote get-url $Remote
if (-not $originalUrl) {
  Write-Error "Remote '$Remote' 을 찾을 수 없습니다."
  exit 1
}

# https://[user@]github.com/... 패턴에서 host 이후 부분 추출해 새 URL 구성
$pattern = '^https://(?:[^@]+@)?([^/]+)/(.+)$'
if ($originalUrl -notmatch $pattern) {
  Write-Error "HTTPS remote URL 아님: $originalUrl · SSH 나 다른 형식은 지원 안 함."
  exit 1
}
$hostName = $Matches[1]
$repoPath = $Matches[2]
$newUrl = "https://$User@$hostName/$repoPath"

Write-Host "▶ 임시 URL: $newUrl" -ForegroundColor Cyan
git remote set-url $Remote $newUrl

try {
  # 브랜치 자동 감지
  if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
  }
  Write-Host "▶ push $Remote $Branch (as $User)" -ForegroundColor Cyan

  $pushArgs = @($Remote, $Branch)
  if ($Force) { $pushArgs = @('--force-with-lease') + $pushArgs }

  & git push @pushArgs
  $exit = $LASTEXITCODE
}
finally {
  # 원래 URL 복구
  git remote set-url $Remote $originalUrl
  Write-Host "▶ 원래 URL 복구: $originalUrl" -ForegroundColor DarkGray
}

if ($exit -ne 0) {
  Write-Host "" -ForegroundColor Red
  Write-Host "❌ push 실패 (exit $exit)" -ForegroundColor Red
  Write-Host "권한 문제라면 자격 증명 관리자에서 확인:" -ForegroundColor Yellow
  Write-Host "  cmdkey /list | findstr git" -ForegroundColor Yellow
  Write-Host "특정 계정 credential 삭제하고 다시 push:" -ForegroundColor Yellow
  Write-Host "  cmdkey /delete:git:https://$User@$hostName" -ForegroundColor Yellow
  exit $exit
}
Write-Host "✅ push 성공" -ForegroundColor Green
