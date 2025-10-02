# PassKit Certificates

## 文件說明

- `pass.p12` - Apple Pass 證書 (PKCS#12 格式，原始文件)
- `passcert.pem` - Pass 簽名證書 (PEM 格式)
- `passkey.pem` - 私鑰 (PEM 格式)
- `wwdr.pem` - Apple WWDR G4 證書 (PEM 格式)

## ⚠️ 安全提醒

**這些文件包含敏感信息，請勿提交到 Git！**

所有 `.p12`, `.pem` 文件已加入 `.gitignore`。

## 證書生成命令 (參考)

```bash
# 從 .p12 導出證書
openssl pkcs12 -in pass.p12 \
  -passin pass:YOUR_PASSWORD \
  -clcerts -nokeys \
  -out passcert.pem -legacy

# 從 .p12 導出私鑰
openssl pkcs12 -in pass.p12 \
  -passin pass:YOUR_PASSWORD \
  -nocerts -nodes \
  -out passkey.pem -legacy

# 下載並轉換 WWDR 證書
curl -o AppleWWDRCAG4.cer https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

## 部署使用

部署時需要將證書轉為 base64 並設置為 Cloudflare secrets:

```bash
# 設置證書 secrets
cat Certificates/passcert.pem | base64 | wrangler secret put PASS_CERT
cat Certificates/passkey.pem | base64 | wrangler secret put PASS_KEY
cat Certificates/wwdr.pem | base64 | wrangler secret put WWDR_CERT
```

詳見 `DEPLOYMENT.md`。
