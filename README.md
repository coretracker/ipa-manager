# IPA/APK Upload API

Simple Node.js API that accepts `.ipa` and `.apk` uploads and returns install links in JSON.

## Setup

```bash
npm install
cp .env.example .env
```

Set `API_TOKEN` in `.env`.
Set `PUBLIC_BASE_URL` to an HTTPS URL reachable by devices.

Optional Slack notifications for new builds:
- `SLACK_BOT_TOKEN` (Bot User OAuth Token, usually starts with xoxb-)
- `SLACK_CHANNEL_ID` (target channel id, e.g. C0123456789)

If both are set, every successful upload posts a new-build message to Slack. If Slack posting fails, upload returns an error.

## Run

```bash
npm start
```

By default it uses a random free port (`PORT=0`) and prints the exact URL on startup.

## Upload endpoint

- Method: `POST`
- URL: `/upload`
- Auth: `Authorization: Bearer <API_TOKEN>`
- Form field: `file` (`.ipa` or `.apk`)
- Optional form field: `summary` (used in response and Slack message)

Example:

```bash
curl -X POST https://api.example.com/upload \
  -H "Authorization: Bearer your-secret-token" \
  -F "summary=QA approved build" \
  -F "file=@/path/to/app.ipa"
```

### IPA response example

```json
{
  "message": "Upload successful",
  "filename": "app-1716976800000.ipa",
  "originalName": "app.ipa",
  "size": 12345678,
  "ipaUrl": "https://downloads.example.com/uploads/app-1716976800000.ipa",
  "manifestUrl": "https://downloads.example.com/uploads/app-1716976800000-manifest.plist",
  "installUrl": "itms-services://?action=download-manifest&url=https%3A%2F%2Fdownloads.example.com%2Fuploads%2Fapp-1716976800000-manifest.plist",
  "installPageUrl": "https://downloads.example.com/uploads/app-1716976800000-install.html",
  "summary": "QA approved build",
  "bundleIdentifier": "com.example.app",
  "version": "1.2.3",
  "buildNumber": "42",
  "title": "Example App"
}
```

### APK response example

```json
{
  "message": "Upload successful",
  "filename": "android-release-1716976800000.apk",
  "originalName": "android-release.apk",
  "size": 7654321,
  "apkUrl": "https://downloads.example.com/uploads/android-release-1716976800000.apk",
  "installPageUrl": "https://downloads.example.com/uploads/android-release-1716976800000-install.html",
  "summary": "Android build for testers",
  "title": "android-release"
}
```
