#!/usr/bin/env node
/**
 * Ensures the native Opus encoder is available for @discordjs/voice.
 *
 * @discordjs/opus only publishes prebuilt binaries for a few Node ABIs, and its
 * bundled libopus sources no longer compile with modern GCC. Because the module
 * is built with N-API the binary is ABI independent, so a prebuild published for
 * any supported Node version loads fine — we just download one and place it in
 * the path @discordjs/node-pre-gyp expects.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { find } = require('@discordjs/node-pre-gyp');

const OPUS_PACKAGE = '@discordjs/opus';
// Any of these N-API prebuilds works on every Node >= 18; 2.35 is the newest glibc
// baseline published by the project.
const FALLBACK_ASSET = 'opus-v0.9.0-node-v111-napi-v3-linux-x64-glibc-2.35.tar.gz';
const RELEASE_URL = `https://github.com/discordjs/opus/releases/download/v0.9.0/${FALLBACK_ASSET}`;

function alreadyWorks() {
    try {
        require(OPUS_PACKAGE);
        return true;
    } catch {
        return false;
    }
}

function download(url, redirects = 0) {
    if (redirects > 5) throw new Error('too many redirects');
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'user-agent': 'foxcraft-setup' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return download(res.headers.location, redirects + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`download failed with HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

async function main() {
    if (alreadyWorks()) {
        console.log('[setup] opus encoder: already available');
        return;
    }

    const packageJson = require.resolve(`${OPUS_PACKAGE}/package.json`);
    const target = find(packageJson);
    if (fs.existsSync(target)) {
        console.log(`[setup] opus encoder: found at ${target}`);
        return;
    }
    if (process.platform !== 'linux' || process.arch !== 'x64') {
        console.warn('[setup] opus encoder: no prebuild for this platform, voice playback will not work');
        return;
    }

    console.log('[setup] opus encoder: downloading prebuilt N-API binary...');
    const tarball = await download(RELEASE_URL);
    const workdir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'foxcraft-opus-'));
    const archive = path.join(workdir, 'opus.tar.gz');
    fs.writeFileSync(archive, tarball);
    execFileSync('tar', ['xzf', archive, '-C', workdir]);

    const found = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name === 'opus.node') found.push(full);
        }
    };
    walk(workdir);
    if (!found.length) throw new Error('opus.node missing from the downloaded archive');

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(found[0], target);
    fs.rmSync(workdir, { recursive: true, force: true });
    console.log(`[setup] opus encoder: installed into ${path.relative(process.cwd(), target)}`);
}

main().catch((error) => {
    console.warn(`[setup] opus encoder unavailable (${error.message}); voice playback will not work.`);
    console.warn('[setup] Install ffmpeg and libopus, or set MUSICC_ENABLED=false to silence this.');
});
