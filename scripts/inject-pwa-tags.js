#!/usr/bin/env node
// scripts/inject-pwa-tags.js
//
// Post-build: injects PWA meta tags into the index.html that Metro generates.
// Metro ignores web/index.html and produces its own, so we patch it after export.
//
// Usage: node scripts/inject-pwa-tags.js [--dist <dir>]

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(
  process.argv.includes('--dist')
    ? process.argv[process.argv.indexOf('--dist') + 1]
    : 'dist'
);

const indexPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`[inject-pwa-tags] ${indexPath} not found — nothing to do.`);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// Tags to inject (order matters for Apple parsing)
const tags = [
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="KBC">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="theme-color" content="#0D0D0F">',
  '<link rel="apple-touch-icon" href="/icon.png">',
  '<link rel="manifest" href="/manifest.json">',
  '<meta name="format-detection" content="telephone=no">',
];

const injection = tags.join('\n');

// Insert after <head>
if (html.includes('<head>')) {
  html = html.replace('<head>', `<head>\n${injection}`);
} else if (html.includes('<head ')) {
  // Some generators use <head ...>
  html = html.replace(/(<head[^>]*>)/, `$1\n${injection}`);
}

// Fix title
html = html.replace(
  /<title>[^<]*<\/title>/,
  '<title>KBC</title>'
);

// Ensure viewport has viewport-fit=cover for notch devices
html = html.replace(
  /<meta name="viewport" content="[^"]*">/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[inject-pwa-tags] PWA meta tags injected into', indexPath);
