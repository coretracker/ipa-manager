const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const AdmZip = require('adm-zip');
const plist = require('plist');

process.env.API_TOKEN = 'test-token';
process.env.PUBLIC_BASE_URL = 'https://downloads.example.com';

const app = require('../server');

function createValidIpa(filePath, info = {}) {
  const zip = new AdmZip();
  const plistXml = plist.build({
    CFBundleIdentifier: info.CFBundleIdentifier || 'com.example.myapp',
    CFBundleVersion: info.CFBundleVersion || '42',
    CFBundleShortVersionString: info.CFBundleShortVersionString || '1.2.3',
    CFBundleDisplayName: info.CFBundleDisplayName || 'My App'
  });

  zip.addFile('Payload/MyApp.app/Info.plist', Buffer.from(plistXml, 'utf8'));
  zip.writeZip(filePath);
}

describe('IPA OTA upload flow', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipa-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('valid IPA generates manifest and install URL', async () => {
    const ipaPath = path.join(tmpDir, 'valid.ipa');
    createValidIpa(ipaPath);

    const response = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer test-token')
      .attach('file', ipaPath);

    expect(response.status).toBe(201);
    expect(response.body.ipaUrl).toMatch(/^https:\/\//);
    expect(response.body.manifestUrl).toMatch(/^https:\/\//);
    expect(response.body.installUrl).toContain('itms-services://?action=download-manifest&url=');
    expect(response.body.installPageUrl).toMatch(/^https:\/\//);
    expect(response.body.bundleIdentifier).toBe('com.example.myapp');
    expect(response.body.version).toBe('1.2.3');
    expect(response.body.buildNumber).toBe('42');
    expect(response.body.title).toBe('My App');

    const manifestFilename = decodeURIComponent(response.body.manifestUrl.split('/').pop());
    const manifestPath = path.join(process.cwd(), 'uploads', manifestFilename);
    const manifestXml = fs.readFileSync(manifestPath, 'utf8');

    expect(manifestXml).toContain(response.body.ipaUrl);

    const installPageFilename = decodeURIComponent(response.body.installPageUrl.split('/').pop());
    const installPagePath = path.join(process.cwd(), 'uploads', installPageFilename);
    const installPage = fs.readFileSync(installPagePath, 'utf8');
    expect(installPage).toContain('Install App');
    expect(installPage).toContain(response.body.installUrl);
  });

  test('missing Info.plist fails', async () => {
    const ipaPath = path.join(tmpDir, 'missing-info.ipa');
    const zip = new AdmZip();
    zip.addFile('Payload/MyApp.app/Other.txt', Buffer.from('x', 'utf8'));
    zip.writeZip(ipaPath);

    const response = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer test-token')
      .attach('file', ipaPath);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Info\.plist/i);
  });

  test('invalid IPA fails', async () => {
    const ipaPath = path.join(tmpDir, 'invalid.ipa');
    fs.writeFileSync(ipaPath, 'not-a-zip', 'utf8');

    const response = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer test-token')
      .attach('file', ipaPath);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid IPA file/i);
  });

  test('manifest contains correct IPA URL', async () => {
    const ipaPath = path.join(tmpDir, 'url-check.ipa');
    createValidIpa(ipaPath, { CFBundleIdentifier: 'com.example.urlcheck' });

    const response = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer test-token')
      .attach('file', ipaPath);

    expect(response.status).toBe(201);

    const manifestFilename = decodeURIComponent(response.body.manifestUrl.split('/').pop());
    const manifestPath = path.join(process.cwd(), 'uploads', manifestFilename);
    const manifestXml = fs.readFileSync(manifestPath, 'utf8');
    const parsed = plist.parse(manifestXml);
    const packageUrl = parsed.items[0].assets[0].url;

    expect(packageUrl).toBe(response.body.ipaUrl);
  });

  test('install URL is correctly encoded', async () => {
    const ipaPath = path.join(tmpDir, 'encoded.ipa');
    createValidIpa(ipaPath);

    const response = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer test-token')
      .attach('file', ipaPath);

    expect(response.status).toBe(201);

    const prefix = 'itms-services://?action=download-manifest&url=';
    expect(response.body.installUrl.startsWith(prefix)).toBe(true);

    const encoded = response.body.installUrl.slice(prefix.length);
    expect(decodeURIComponent(encoded)).toBe(response.body.manifestUrl);
  });
});
