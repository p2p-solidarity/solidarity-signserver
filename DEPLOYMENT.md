# PassKit Signing Service - Deployment Guide

## 部署步驟

### 1. 準備證書 (已完成)

證書已從 `.p12` 文件導出為 PEM 格式:
- `Certificates/passcert.pem` - Pass 簽名證書
- `Certificates/passkey.pem` - 私鑰
- `Certificates/wwdr.pem` - Apple WWDR 證書

### 2. 設置 Cloudflare Secrets

將證書轉為 base64 並設置為 Cloudflare Worker secrets:

```bash
# 在項目根目錄執行

# 設置 Pass 證書 (base64)
cat Certificates/passcert.pem | base64 | bunx wrangler secret put PASS_CERT

# 設置私鑰 (base64)
cat Certificates/passkey.pem | base64 | bunx wrangler secret put PASS_KEY

# 設置 WWDR 證書 (base64)
cat Certificates/wwdr.pem | base64 | bunx wrangler secret put WWDR_CERT
```

**注意:** 每個命令執行後會提示你粘貼 secret 值。直接按 Ctrl+D 完成輸入。

### 3. 本地測試

```bash
# 啟動本地開發服務器
bun run dev

# 在另一個終端測試
curl -X POST http://localhost:8787/sign-pass \
  -H "Content-Type: text/plain" \
  -d '{"pass.json":"abc123","icon.png":"def456"}' \
  --output signature

# 檢查簽名
file signature
ls -lh signature
```

### 4. 部署到 Cloudflare Workers

```bash
bun run deploy
```

部署完成後你會得到一個 URL，例如:
```
https://airmeishi-backend.YOUR_SUBDOMAIN.workers.dev
```

### 5. 更新 iOS App

在 PassKitManager.swift 中更新 API URL:

```swift
let apiURL = URL(string: "https://airmeishi-backend.YOUR_SUBDOMAIN.workers.dev/sign-pass")!
```

## API 端點

### POST /sign-pass

簽名 Apple Wallet pass manifest。

**Request:**
- Content-Type: `text/plain`
- Body: manifest JSON 內容 (字符串)

**Response:**
- Success (200): `application/octet-stream` - PKCS#7 簽名 (DER 格式)
- Error (500): JSON 錯誤信息

**Example:**

```bash
curl -X POST https://your-worker.workers.dev/sign-pass \
  -H "Content-Type: text/plain" \
  -d '{
    "pass.json": "sha256-hash-here",
    "icon.png": "sha256-hash-here",
    "logo.png": "sha256-hash-here"
  }' \
  --output signature
```

## 安全性考慮

### ✅ 當前實施
- 證書存儲在 Cloudflare Secrets (加密)
- CORS 允許所有來源 (對於公開 API)
- HTTPS 自動啟用

### 🔒 可選加強 (如需限制訪問)

添加 API Key 驗證:

1. 設置 API key:
```bash
wrangler secret put API_KEY
# 輸入: sk_live_your_random_key_here
```

2. 修改 `src/routes/passkit/sign.ts`:
```typescript
// 在 handler 開頭添加
if (c.req.header("X-API-Key") !== c.env.API_KEY) {
  return c.json({ error: "Unauthorized" }, 401);
}
```

3. iOS 請求時添加 header:
```swift
request.setValue("sk_live_your_random_key_here", forHTTPHeaderField: "X-API-Key")
```

## 故障排除

### Worker 部署失敗
```bash
# 檢查登入狀態
wrangler whoami

# 重新登入
wrangler login
```

### Secrets 未設置
```bash
# 查看當前 secrets
wrangler secret list

# 重新設置
cat Certificates/passcert.pem | base64 | wrangler secret put PASS_CERT
```

### 本地開發 secrets
本地開發需要在 `.dev.vars` 文件中設置環境變數:

```bash
# .dev.vars (不要提交到 git)
PASS_CERT="base64_encoded_cert_here"
PASS_KEY="base64_encoded_key_here"
WWDR_CERT="base64_encoded_wwdr_here"
```

生成 base64:
```bash
cat Certificates/passcert.pem | base64 -w 0 > pass_cert.b64
cat Certificates/passkey.pem | base64 -w 0 > pass_key.b64
cat Certificates/wwdr.pem | base64 -w 0 > wwdr.b64
```

## 成本

### Cloudflare Workers 免費方案
- 100,000 requests/day
- 10ms CPU time/request
- 完全免費

對於 PassKit 簽名服務來說,免費方案已經足夠。

## OpenAPI 文檔

訪問 `/openapi.json` 查看完整 API 文檔。

## 下一步

- [ ] 部署到 Cloudflare Workers
- [ ] 設置 secrets
- [ ] 更新 iOS app API URL
- [ ] 真機測試 pass 生成
- [ ] (可選) 添加 API key 驗證
