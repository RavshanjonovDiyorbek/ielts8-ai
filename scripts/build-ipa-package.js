const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const DOWNLOADS_DIR = path.join(PUBLIC_DIR, 'downloads');
const IOS_APP_DIR = path.join(ROOT, 'ios', 'App', 'App');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '192.168.0.103';
}

// ==================== CRC32 + PURE-NODE ZIP (.IPA) BUILDER ====================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function createZipBuffer(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x5421, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x5421, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0x81a40000, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    localChunks.push(local, compressed);
    centralChunks.push(central);
    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralBuf, eocd]);
}

// ==================== PURE-NODE 180x180 APP ICON PNG GENERATOR ====================
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function generateAppIconPng(size = 180) {
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);

  for (let y = 0; y < size; y++) {
    const rowOff = y * rowLen;
    raw[rowOff] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const px = rowOff + 1 + x * 4;
      const t = (x + y) / (size * 2);
      // Deep iOS dark gradient background with vibrant blue-emerald glow + golden center emblem
      let r = Math.round(10 + 18 * t);
      let g = Math.round(24 + 90 * t);
      let b = Math.round(62 + 170 * (1 - t));

      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.72 && dist > 0.60) {
        r = 48;
        g = 209;
        b = 88;
      } else if (dist <= 0.60) {
        r = 12;
        g = 132;
        b = 255;
        // Draw stylized "8" figure inside center circle
        const upDist = Math.hypot(dx * 1.1, dy + 0.17);
        const lowDist = Math.hypot(dx * 1.0, dy - 0.19);
        const inUpperRing = upDist < 0.24 && upDist > 0.11;
        const inLowerRing = lowDist < 0.27 && lowDist > 0.13;
        if (inUpperRing || inLowerRing) {
          r = 255;
          g = 255;
          b = 255;
        }
      }
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function buildInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>uz</string>
  <key>CFBundleDisplayName</key>
  <string>IELTS 8 AI</string>
  <key>CFBundleExecutable</key>
  <string>App</string>
  <key>CFBundleIdentifier</key>
  <string>uz.ielts8.aiteacher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>IELTS8AI</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  <key>MinimumOSVersion</key>
  <string>15.0</string>
  <key>UIDeviceFamily</key>
  <array>
    <integer>1</integer>
  </array>
  <key>UILaunchStoryboardName</key>
  <string>LaunchScreen</string>
  <key>UIStatusBarStyle</key>
  <string>UIStatusBarStyleLightContent</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>IELTS Speaking va Talaffuz Rentgeni uchun mikrofon kerak</string>
  <key>NSCameraUsageDescription</key>
  <string>Qolyozma insho va rasmlarni tekshirish uchun kamera kerak</string>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>Galereyadan rasm yuklash uchun ruxsat kerak</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
</dict>
</plist>
`;
}

function formatBase64Lines(b64, indent = '      ') {
  return b64.match(/.{1,64}/g).map((line) => `${indent}${line}`).join('\n');
}

function buildWebClipPayload({ label, displayName, description, url, identifier, uuid, formattedIcon }) {
  return `    <dict>
      <key>FullScreen</key>
      <true/>
      <key>Icon</key>
      <data>
${formattedIcon}
      </data>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>${label}</string>
      <key>PayloadDescription</key>
      <string>${description}</string>
      <key>PayloadDisplayName</key>
      <string>${displayName}</string>
      <key>PayloadIdentifier</key>
      <string>${identifier}</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>${uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${url}</string>
    </dict>`;
}

function buildMobileConfig(appUrl, embeddedDataUrl, iconPngBase64) {
  const formattedIcon = formatBase64Lines(iconPngBase64);
  const wifiClip = buildWebClipPayload({
    label: 'IELTS 8 AI',
    displayName: 'IELTS 8 AI (Wi-Fi)',
    description: 'Gemini 4 Hydrogen — IELTS 8.0 Shaxsiy AI Ustoz (Wi-Fi Server &amp; Fullscreen)',
    url: appUrl,
    identifier: 'uz.ielts8.aiteacher.webclip.wifi',
    uuid: '88A1B2C3-D4E5-4F60-9123-AABBCCDDEE01',
    formattedIcon
  });
  const offlineClip = buildWebClipPayload({
    label: 'IELTS 8 (4G/Offline)',
    displayName: 'IELTS 8 AI (4G / Kompyutersiz)',
    description: 'Gemini 4 Hydrogen — 100% Serversiz Mustaqil Ilova (Kompyuter ochiq bolmasa ham ishlaydi)',
    url: embeddedDataUrl,
    identifier: 'uz.ielts8.aiteacher.webclip.offline',
    uuid: '88A1B2C3-D4E5-4F60-9123-AABBCCDDEE03',
    formattedIcon
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
${wifiClip}
${offlineClip}
  </array>
  <key>PayloadDescription</key>
  <string>iPhone 13 Pro asosiy ekraniga IELTS 8 AI (Wi-Fi) va IELTS 8 (4G/Offline) ikonalarini o'rnatadi.</string>
  <key>PayloadDisplayName</key>
  <string>IELTS 8 AI Ustoz (iPhone 13 Pro)</string>
  <key>PayloadIdentifier</key>
  <string>uz.ielts8.aiteacher.profile</string>
  <key>PayloadOrganization</key>
  <string>Gemini 4 Hydrogen Personal Tutor</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>88A1B2C3-D4E5-4F60-9123-AABBCCDDEE02</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

function buildOfflineMobileConfig(embeddedDataUrl, iconPngBase64) {
  const formattedIcon = formatBase64Lines(iconPngBase64);
  const offlineClip = buildWebClipPayload({
    label: 'IELTS 8 AI',
    displayName: 'IELTS 8 AI (4G / Kompyutersiz)',
    description: 'Gemini 4 Hydrogen — 100% Serversiz Mustaqil Ilova (4G/5G va Kompyutersiz)',
    url: embeddedDataUrl,
    identifier: 'uz.ielts8.aiteacher.standalone.webclip',
    uuid: '99B2C3D4-E5F6-4A70-8123-AABBCCDDEE11',
    formattedIcon
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
${offlineClip}
  </array>
  <key>PayloadDescription</key>
  <string>Kompyuter o'chiq paytda ham 4G/5G da ishlaydigan mustaqil IELTS 8 AI WebClip profili.</string>
  <key>PayloadDisplayName</key>
  <string>IELTS 8 AI (4G / Kompyutersiz)</string>
  <key>PayloadIdentifier</key>
  <string>uz.ielts8.aiteacher.standalone.profile</string>
  <key>PayloadOrganization</key>
  <string>Gemini 4 Hydrogen Personal Tutor</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>99B2C3D4-E5F6-4A70-8123-AABBCCDDEE12</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

function buildStandaloneHtml() {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');

  return html
    .replace(/<link rel="stylesheet" href="\/styles\.css(?:\?[^"]*)?"\s*\/>/, () => `<style>\n${css}\n</style>`)
    .replace(/<script src="\/app\.js(?:\?[^"]*)?"><\/script>/, () => `<script>\n${js}\n</script>`);
}

function collectPublicAssets() {
  const files = ['index.html', 'styles.css', 'app.js', 'manifest.json', 'icon.svg', 'apple-touch-icon.png', 'sw.js'];
  return files
    .filter((f) => fs.existsSync(path.join(PUBLIC_DIR, f)))
    .map((f) => ({
      name: `Payload/IELTS8AI.app/public/${f}`,
      data: fs.readFileSync(path.join(PUBLIC_DIR, f))
    }));
}

function main() {
  ensureDir(DIST_DIR);
  ensureDir(DOWNLOADS_DIR);
  ensureDir(IOS_APP_DIR);

  const lanIp = getLanIp();
  const appUrl = `http://${lanIp}:3000/`;
  const iconPng = generateAppIconPng(180);
  const infoPlist = buildInfoPlist();

  // Save real PNG Apple Touch Icon into public/ & ios/
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), iconPng);
  fs.writeFileSync(path.join(IOS_APP_DIR, 'Info.plist'), infoPlist, 'utf8');
  fs.writeFileSync(path.join(IOS_APP_DIR, 'AppIcon60x60@3x.png'), iconPng);

  // 1. Build IELTS8-AI-iPhone13Pro.ipa bundle archive
  const ipaEntries = [
    { name: 'Payload/IELTS8AI.app/Info.plist', data: infoPlist },
    { name: 'Payload/IELTS8AI.app/PkgInfo', data: 'APPL????' },
    { name: 'Payload/IELTS8AI.app/AppIcon60x60@3x.png', data: iconPng },
    { name: 'Payload/IELTS8AI.app/capacitor.config.json', data: fs.readFileSync(path.join(ROOT, 'capacitor.config.json')) },
    ...collectPublicAssets()
  ];
  const ipaBuffer = createZipBuffer(ipaEntries);

  // 2. Build Single-File 100% Standalone HTML App & Embedded Data URI
  const standaloneHtml = buildStandaloneHtml();
  const embeddedDataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(standaloneHtml, 'utf8').toString('base64')}`;

  // 3. Build Fixed .mobileconfig Profiles (with uppercase com.apple.webClip.managed)
  const iconB64 = iconPng.toString('base64');
  const mobileConfig = buildMobileConfig(appUrl, embeddedDataUrl, iconB64);
  const offlineMobileConfig = buildOfflineMobileConfig(embeddedDataUrl, iconB64);

  // 4. Write Windows 1-Click Cloud Xcode IPA Builder Helper
  const batScript = `@echo off
echo ===================================================
echo  IELTS 8 AI (iPhone 13 Pro) - Haqiqiy Xcode .IPA Quruvchi
echo ===================================================
echo.
git init 2>nul
git add .
git commit -m "Build IELTS 8 AI iOS .ipa for iPhone 13 Pro"
echo.
echo GitHub repository manzilini kiriting (masalan: https://github.com/USERNAME/ielts8-ai.git):
set /p REPO_URL=URL: 
git branch -M main
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git push -u origin main
echo.
echo Tayyor! GitHub -> Actions -> "Build iOS .ipa for iPhone 13 Pro" ga kirib
echo 3 daqiqadan keyin tayyor compiled .ipa faylni yuklab oling!
pause
`;

  const targets = [
    [path.join(DIST_DIR, 'IELTS8-AI-iPhone13Pro.ipa'), ipaBuffer],
    [path.join(DOWNLOADS_DIR, 'IELTS8-AI-iPhone13Pro.ipa'), ipaBuffer],
    [path.join(DIST_DIR, 'IELTS8-AI-iPhone13Pro.mobileconfig'), mobileConfig],
    [path.join(DOWNLOADS_DIR, 'IELTS8-AI-iPhone13Pro.mobileconfig'), mobileConfig],
    [path.join(DIST_DIR, 'IELTS8-AI-Offline-4G.mobileconfig'), offlineMobileConfig],
    [path.join(DOWNLOADS_DIR, 'IELTS8-AI-Offline-4G.mobileconfig'), offlineMobileConfig],
    [path.join(DIST_DIR, 'IELTS8-AI-Standalone-iPhone13Pro.html'), standaloneHtml],
    [path.join(DOWNLOADS_DIR, 'IELTS8-AI-Standalone-iPhone13Pro.html'), standaloneHtml],
    [path.join(ROOT, 'BUILD_IPA_CLOUD.bat'), batScript]
  ];

  for (const [filePath, content] of targets) {
    fs.writeFileSync(filePath, content);
  }

  console.log(`Built iOS packages successfully (LAN: ${appUrl}):`);
  console.log(`- .ipa archive: ${(ipaBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`- .mobileconfig (Wi-Fi + 4G dual): ${(Buffer.byteLength(mobileConfig) / 1024).toFixed(1)} KB`);
  console.log(`- .mobileconfig (Offline 4G only): ${(Buffer.byteLength(offlineMobileConfig) / 1024).toFixed(1)} KB`);
  console.log(`- standalone .html: ${(Buffer.byteLength(standaloneHtml) / 1024).toFixed(1)} KB`);
}

main();
