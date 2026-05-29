const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const plist = require('plist');
const bplistParser = require('bplist-parser');

function createUserError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

function parsePlistBuffer(buffer) {
  try {
    return bplistParser.parseBuffer(buffer)[0];
  } catch (_binaryErr) {
    try {
      return plist.parse(buffer.toString('utf8'));
    } catch (_xmlErr) {
      throw createUserError('Failed to parse Info.plist from IPA.');
    }
  }
}

function extractIpaMetadata(ipaPath) {
  let zip;
  try {
    zip = new AdmZip(ipaPath);
  } catch (_e) {
    throw createUserError('Invalid IPA file: failed to read archive.');
  }

  const entries = zip.getEntries();
  const infoPlistEntry = entries.find((entry) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry.entryName));

  if (!infoPlistEntry) {
    throw createUserError('Invalid IPA file: Info.plist not found under Payload/*.app/.');
  }

  const plistBuffer = infoPlistEntry.getData();
  if (!plistBuffer || plistBuffer.length === 0) {
    throw createUserError('Invalid IPA file: Info.plist is empty.');
  }

  const info = parsePlistBuffer(plistBuffer);
  const bundleIdentifier = info.CFBundleIdentifier;
  const bundleVersion = info.CFBundleVersion;
  const shortVersion = info.CFBundleShortVersionString;
  const title = info.CFBundleDisplayName || info.CFBundleName;

  if (!bundleIdentifier || !bundleVersion || !shortVersion || !title) {
    throw createUserError(
      'IPA metadata incomplete: CFBundleIdentifier, CFBundleVersion, CFBundleShortVersionString, and title are required.'
    );
  }

  return {
    bundleIdentifier,
    bundleVersion,
    shortVersion,
    title
  };
}

function buildManifestObject({ ipaUrl, metadata }) {
  return {
    items: [
      {
        assets: [
          {
            kind: 'software-package',
            url: ipaUrl
          }
        ],
        metadata: {
          'bundle-identifier': metadata.bundleIdentifier,
          'bundle-version': metadata.bundleVersion,
          kind: 'software',
          title: metadata.title
        }
      }
    ]
  };
}

function generateManifestXml({ ipaUrl, metadata }) {
  const manifestObject = buildManifestObject({ ipaUrl, metadata });
  const xml = plist.build(manifestObject);

  try {
    const parsed = plist.parse(xml);
    const packageUrl =
      parsed &&
      parsed.items &&
      parsed.items[0] &&
      parsed.items[0].assets &&
      parsed.items[0].assets[0] &&
      parsed.items[0].assets[0].url;

    if (packageUrl !== ipaUrl) {
      throw new Error('Manifest URL mismatch.');
    }
  } catch (_e) {
    throw createUserError('Generated manifest plist validation failed.');
  }

  return xml;
}

function writeManifestToStorage({ manifestXml, uploadDir, ipaFilename }) {
  const base = path.basename(ipaFilename, path.extname(ipaFilename));
  const manifestFilename = `${base}-manifest.plist`;
  const manifestPath = path.join(uploadDir, manifestFilename);

  fs.writeFileSync(manifestPath, manifestXml, 'utf8');

  return {
    manifestFilename,
    manifestPath
  };
}

function ensureHttpsUrl(urlValue, kind) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch (_e) {
    throw createUserError(`Invalid ${kind} URL.`);
  }

  if (parsed.protocol !== 'https:') {
    throw createUserError(`${kind} URL must use HTTPS.`);
  }
}

function resolveBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

function buildPublicFileUrl(baseUrl, filename) {
  return `${baseUrl}/uploads/${encodeURIComponent(filename)}`;
}

function buildInstallUrl(manifestUrl) {
  return `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
}

function generateInstallPageHtml({ title, installUrl, bundleIdentifier, version, buildNumber }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} Install</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f7f9ff; color: #1a1f36; }
    .wrap { min-height: 100vh; padding: max(20px, env(safe-area-inset-top)) 14px max(20px, env(safe-area-inset-bottom)); text-align: center; }
    .content { width: min(100%, 520px); margin: 0 auto; }
    h1 { margin: 0 0 10px; font-size: clamp(22px, 5vw, 28px); line-height: 1.2; word-break: break-word; }
    p { margin: 8px 0; color: #475069; font-size: clamp(14px, 3.2vw, 16px); line-height: 1.45; overflow-wrap: anywhere; }
    .btn { margin-top: 20px; display: inline-flex; justify-content: center; align-items: center; width: 100%; min-height: 48px; text-decoration: none; background: #0b63f6; color: #fff; padding: 12px 18px; border-radius: 10px; font-weight: 700; font-size: 16px; }
    @media (max-width: 420px) {
      .btn { min-height: 50px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="content">
      <h1>${title}</h1>
      <p>Bundle ID: ${bundleIdentifier}</p>
      <p>Version: ${version} (${buildNumber})</p>
      <a class="btn" href="${installUrl}">Install App</a>
    </div>
  </div>
</body>
</html>`;
}

function writeInstallPageToStorage({ html, uploadDir, ipaFilename }) {
  const base = path.basename(ipaFilename, path.extname(ipaFilename));
  const pageFilename = `${base}-install.html`;
  const pagePath = path.join(uploadDir, pageFilename);
  fs.writeFileSync(pagePath, html, 'utf8');
  return { pageFilename, pagePath };
}

module.exports = {
  buildInstallUrl,
  buildPublicFileUrl,
  createUserError,
  ensureHttpsUrl,
  extractIpaMetadata,
  generateInstallPageHtml,
  generateManifestXml,
  resolveBaseUrl,
  writeInstallPageToStorage,
  writeManifestToStorage
};
