# IPA Upload API

Simple Node.js API that accepts `.ipa` uploads and returns OTA install links in JSON.

## Setup

```bash
npm install
cp .env.example .env
```

Set `API_TOKEN` in `.env`.
Set `PUBLIC_BASE_URL` to an HTTPS URL reachable by iOS devices (for OTA install links).

## Run

```bash
npm start
```

Or with explicit env vars (overrides `.env`):

```bash
API_TOKEN=your-secret-token npm start
```

By default it uses a random free port (`PORT=0`) and prints the exact URL on startup.

## Upload endpoint

- Method: `POST`
- URL: `/upload`
- Auth: `Authorization: Bearer <API_TOKEN>`
- Form field: `file` (`.ipa`)

Example:

```bash
curl -X POST http://localhost:<printed-port>/upload \
  -H "Authorization: Bearer your-secret-token" \
  -F "file=@/path/to/app.ipa"
```

Response example:

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
  "bundleIdentifier": "com.example.app",
  "version": "1.2.3",
  "buildNumber": "42",
  "title": "Example App"
}
```
