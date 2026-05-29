require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  buildInstallUrl,
  buildPublicFileUrl,
  ensureHttpsUrl,
  extractIpaMetadata,
  generateAndroidInstallPageHtml,
  generateInstallPageHtml,
  generateManifestXml,
  resolveBaseUrl,
  writeInstallPageToStorage,
  writeManifestToStorage
} = require('./src/ipa-ota');
const {
  postNewBuildToSlack
} = require('./src/slack');

const app = express();
const port = Number(process.env.PORT || 0);
const apiToken = process.env.API_TOKEN || 'change-me-token';
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.ipa' || ext === '.apk') {
      return cb(null, true);
    }
    cb(new Error('Only .ipa and .apk files are allowed.'));
  }
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token || token !== apiToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.use('/uploads', express.static(uploadDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/upload', auth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file field (use "file").' });
    }

    const summary = typeof req.body.summary === 'string' ? req.body.summary.trim() : '';
    const baseUrl = resolveBaseUrl(req);
    const fileUrl = buildPublicFileUrl(baseUrl, req.file.filename);
    const ext = path.extname(req.file.filename).toLowerCase();

    if (ext === '.ipa') {
      const metadata = extractIpaMetadata(req.file.path);
      ensureHttpsUrl(fileUrl, 'IPA');

      const manifestXml = generateManifestXml({
        ipaUrl: fileUrl,
        metadata
      });

      const { manifestFilename } = writeManifestToStorage({
        manifestXml,
        uploadDir,
        ipaFilename: req.file.filename
      });

      const manifestUrl = buildPublicFileUrl(baseUrl, manifestFilename);
      ensureHttpsUrl(manifestUrl, 'Manifest');

      const installUrl = buildInstallUrl(manifestUrl);
      const installPageHtml = generateInstallPageHtml({
        title: metadata.title,
        installUrl,
        bundleIdentifier: metadata.bundleIdentifier,
        version: metadata.shortVersion,
        buildNumber: metadata.bundleVersion
      });
      const { pageFilename } = writeInstallPageToStorage({
        html: installPageHtml,
        uploadDir,
        artifactFilename: req.file.filename
      });
      const installPageUrl = buildPublicFileUrl(baseUrl, pageFilename);
      ensureHttpsUrl(installPageUrl, 'Install page');

      await postNewBuildToSlack({
        platform: 'iOS',
        title: metadata.title,
        summary,
        version: metadata.shortVersion,
        buildNumber: metadata.bundleVersion,
        primaryUrl: installPageUrl,
        artifactUrl: fileUrl,
        details: [
          `Bundle: ${metadata.bundleIdentifier}`,
          `Manifest: ${manifestUrl}`
        ]
      });

      return res.status(201).json({
        message: 'Upload successful',
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        ipaUrl: fileUrl,
        manifestUrl,
        installUrl,
        installPageUrl,
        summary,
        bundleIdentifier: metadata.bundleIdentifier,
        version: metadata.shortVersion,
        buildNumber: metadata.bundleVersion,
        title: metadata.title
      });
    }

    if (ext === '.apk') {
      ensureHttpsUrl(fileUrl, 'APK');
      const title = path.basename(req.file.originalname, '.apk');
      const installPageHtml = generateAndroidInstallPageHtml({
        title,
        apkUrl: fileUrl,
        summary
      });
      const { pageFilename } = writeInstallPageToStorage({
        html: installPageHtml,
        uploadDir,
        artifactFilename: req.file.filename
      });
      const installPageUrl = buildPublicFileUrl(baseUrl, pageFilename);
      ensureHttpsUrl(installPageUrl, 'Install page');

      await postNewBuildToSlack({
        platform: 'Android',
        title,
        summary,
        primaryUrl: installPageUrl,
        artifactUrl: fileUrl
      });

      return res.status(201).json({
        message: 'Upload successful',
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        apkUrl: fileUrl,
        installPageUrl,
        summary,
        title
      });
    }

    return res.status(400).json({ error: 'Unsupported file type.' });
  } catch (err) {
    return next(err);
  }
});

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 400;
  res.status(statusCode).json({ error: err.message || 'Upload error' });
});

if (require.main === module) {
  const server = app.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Server running on http://localhost:${actualPort}`);
  });
}

module.exports = app;
