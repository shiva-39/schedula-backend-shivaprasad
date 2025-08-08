#!/usr/bin/env pwsh
# Sync script for Shivaprasad's Individual Deployment
# Personal Repo: https://github.com/shiva-39/schedula-backend-shivaprasad.git
# This script syncs changes from organization repo to personal repo and triggers Render deployment

Write-Host "🚀 Schedula Deployment Sync Script - Shivaprasad" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "📍 Personal Repo: https://github.com/shiva-39/schedula-backend-shivaprasad.git" -ForegroundColor Cyan
Write-Host ""

# Add organization repo as upstream (only run once)
Write-Host "📡 Adding organization repo as upstream..." -ForegroundColor Yellow
try {
    git remote add upstream https://github.com/PearlThoughtsInternship/Schedula_Dev_Dominators_Backend.git 2>$null
    Write-Host "✅ Upstream added successfully" -ForegroundColor Green
} catch {
    Write-Host "ℹ️  Upstream already exists or error occurred" -ForegroundColor Blue
}

# Fetch latest changes from organization repo
Write-Host "📥 Fetching latest changes from organization repo..." -ForegroundColor Yellow
git fetch upstream

# Checkout to main branch
Write-Host "🔄 Switching to main branch..." -ForegroundColor Yellow
git checkout main

# Merge changes from your intern branch in org repo
Write-Host "🔀 Merging latest changes from intern/shivaprasad-main..." -ForegroundColor Yellow
git merge upstream/intern/shivaprasad-main

# Push to your personal GitHub repo (triggers Render auto-deploy)
Write-Host "🚀 Pushing to personal repo (triggers Render deployment)..." -ForegroundColor Yellow
git push origin main

Write-Host "✅ Sync and deployment trigger complete!" -ForegroundColor Green
Write-Host "🌐 Check your Render dashboard for deployment status" -ForegroundColor Cyan
