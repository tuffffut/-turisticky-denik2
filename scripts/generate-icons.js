import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create beautiful Mountain / Trekking SVG
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1917" />
      <stop offset="100%" stop-color="#0c0a09" />
    </linearGradient>
    <linearGradient id="primaryPeak" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="50%" stop-color="#059669" />
      <stop offset="100%" stop-color="#064e3b" />
    </linearGradient>
    <linearGradient id="secondaryPeak" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6ee7b7" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="backPeak" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#44403c" />
      <stop offset="100%" stop-color="#292524" />
    </linearGradient>
    <linearGradient id="sunGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Dark stone background with subtle border -->
  <rect width="512" height="512" rx="104" fill="url(#bgGrad)" />
  <rect width="504" height="504" x="4" y="4" rx="100" fill="none" stroke="#10b981" stroke-width="3" stroke-opacity="0.25" />

  <!-- Sun rising / Glowing beacon -->
  <circle cx="256" cy="148" r="42" fill="url(#sunGlow)" filter="url(#glow)" opacity="0.9" />

  <!-- Background mountain -->
  <polygon points="120,400 256,190 392,400" fill="url(#backPeak)" />
  <!-- Snow cap back -->
  <polygon points="256,190 286,236 266,230 256,242 246,230 226,236" fill="#78716c" opacity="0.6" />

  <!-- Left mountain (medium) -->
  <polygon points="64,400 180,240 310,400" fill="url(#secondaryPeak)" opacity="0.9" />
  <!-- Snow cap left -->
  <polygon points="180,240 205,274 190,270 180,278 170,270 155,274" fill="#d1fae5" />

  <!-- Main prominent mountain peak (emerald) -->
  <polygon points="180,400 320,180 448,400" fill="url(#primaryPeak)" />
  <!-- Snow cap main -->
  <polygon points="320,180 348,225 332,220 320,230 308,220 292,225" fill="#ecfdf5" />

  <!-- Mountain shadow ridge -->
  <polygon points="320,180 320,400 448,400" fill="#042f2e" opacity="0.4" />

  <!-- Hiking trail / GPS route winding up -->
  <path d="M 120 400 Q 180 370 230 380 T 310 330 T 320 230" 
        fill="none" 
        stroke="#facc15" 
        stroke-width="7" 
        stroke-dasharray="10 8" 
        stroke-linecap="round" />

  <!-- Summit Flag / Pin -->
  <circle cx="320" cy="180" r="8" fill="#facc15" filter="url(#glow)" />
</svg>`;

// Maskable icon with 15% safe zone padding and full-bleed square background
const svgMaskableIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1917" />
      <stop offset="100%" stop-color="#0c0a09" />
    </linearGradient>
    <linearGradient id="primaryPeakM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="50%" stop-color="#059669" />
      <stop offset="100%" stop-color="#064e3b" />
    </linearGradient>
    <linearGradient id="secondaryPeakM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6ee7b7" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="backPeakM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#44403c" />
      <stop offset="100%" stop-color="#292524" />
    </linearGradient>
    <linearGradient id="sunGlowM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>

  <!-- Full bleed square background -->
  <rect width="512" height="512" fill="url(#bgGradMask)" />

  <!-- Scaled group centered inside safe zone (0.76 scale) -->
  <g transform="translate(61, 61) scale(0.76)">
    <!-- Sun rising -->
    <circle cx="256" cy="148" r="42" fill="url(#sunGlowM)" opacity="0.9" />

    <!-- Background mountain -->
    <polygon points="120,400 256,190 392,400" fill="url(#backPeakM)" />
    <polygon points="256,190 286,236 266,230 256,242 246,230 226,236" fill="#78716c" opacity="0.6" />

    <!-- Left mountain -->
    <polygon points="64,400 180,240 310,400" fill="url(#secondaryPeakM)" opacity="0.9" />
    <polygon points="180,240 205,274 190,270 180,278 170,270 155,274" fill="#d1fae5" />

    <!-- Main peak -->
    <polygon points="180,400 320,180 448,400" fill="url(#primaryPeakM)" />
    <polygon points="320,180 348,225 332,220 320,230 308,220 292,225" fill="#ecfdf5" />
    <polygon points="320,180 320,400 448,400" fill="#042f2e" opacity="0.4" />

    <!-- Trail -->
    <path d="M 120 400 Q 180 370 230 380 T 310 330 T 320 230" 
          fill="none" 
          stroke="#facc15" 
          stroke-width="7" 
          stroke-dasharray="10 8" 
          stroke-linecap="round" />

    <!-- Summit Flag / Pin -->
    <circle cx="320" cy="180" r="8" fill="#facc15" />
  </g>
</svg>`;

async function generate() {
  const publicDir = path.resolve(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. Save icon.svg
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon);
  console.log('Saved public/icon.svg');

  const svgBuffer = Buffer.from(svgIcon);
  const svgMaskableBuffer = Buffer.from(svgMaskableIcon);

  // 2. Generate pwa-512x512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 3. Generate pwa-192x192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 4. Generate pwa-maskable-512x512.png
  await sharp(svgMaskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');

  // 5. Generate apple-touch-icon.png (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 6. Generate favicon.ico / favicon-32x32.png
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Generated favicon.ico');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
