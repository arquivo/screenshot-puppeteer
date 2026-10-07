// A loopback stand in for pywb's noFrame replay, so the test suite never
// depends on arquivo.pt being up and fast.
//
// It mimics the two things the allowlist cares about: pages live under
// /noFrame/replay/<timestamp>/<archived url> and the client side rewriter is
// served from /noFrame/static/, outside the replay prefix.

const express = require('express');

// Titles are keyed by the archived host so the fixture URLs read like the real
// ones, and the filenames the service derives from them stay recognisable.
const TITLES = {
    'www.caleida.pt': 'José Saramago home page',
    'senior3045.ipportalegre.pt': 'Senior3045 Home page',
    'www.cidadao.gov.ao': 'Cidadão de Angola',
};

const DEFAULT_TITLE = 'Archived page';

// 1x1 PNG, stretched by the page so it covers a visible area.
const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64');

function archivedHost(path) {
    const match = /^\/noFrame\/replay\/[^/]*\/https?:\/\/([^/]+)/.exec(path);
    return match === null ? null : match[1];
}

// Enough coloured, varied content that a full page PNG is comfortably over the
// size the app tests assert on. A blank page compresses down to a few hundred
// bytes and would make those assertions meaningless.
function filler(title) {
    let rows = '';
    for (let i = 0; i < 120; i += 1) {
        const hue = (i * 37) % 360;
        rows += `<p style="margin:0;padding:6px;font:14px sans-serif;` +
            `background:hsl(${hue},70%,82%);color:hsl(${hue},80%,18%)">` +
            `${title} — line ${i} — ${'arquivo.pt '.repeat(5)}</p>`;
    }
    return rows;
}

function replayPage(path) {
    const title = TITLES[archivedHost(path)] || DEFAULT_TITLE;
    return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">
<title>${title}</title>
<script src="/noFrame/static/wombat.js"></script>
</head><body style="margin:0">
<img src="/noFrame/replay/19980205082901im_/http://www.caleida.pt/logo.png"
     style="width:800px;height:120px" alt="logo">
${filler(title)}
</body></html>`;
}

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// Resolves to a handle with the origin, the matching allowlist prefixes and a
// per path hit counter, so a test can assert that nothing was fetched.
async function startReplayServer() {
    const hits = { replay: 0, static: 0, image: 0, outside: 0 };
    const app = express();

    app.get('/noFrame/static/wombat.js', (request, response) => {
        hits.static += 1;
        response.type('application/javascript').send('window.__wombat_fixture = true;\n');
    });

    app.get(/^\/noFrame\/replay\//, (request, response) => {
        if (request.path.endsWith('.png')) {
            hits.image += 1;
            return response.type('image/png').send(PIXEL);
        }
        hits.replay += 1;
        response.send(replayPage(request.path));
    });

    // Outside the replay prefix, on an otherwise allowed host.
    app.use((request, response) => {
        hits.outside += 1;
        response.send('<html><head><title>Outside</title></head><body>outside</body></html>');
    });

    const server = await listen(app);
    const origin = `http://127.0.0.1:${server.address().port}`;

    return {
        server,
        origin,
        hits,
        navigationPrefix: `${origin}/noFrame/replay/`,
        subresourcePrefix: `${origin}/noFrame/static/`,
        replayUrl(timestamp, archivedUrl) {
            return `${origin}/noFrame/replay/${timestamp}/${archivedUrl}`;
        },
        close() {
            return new Promise(resolve => server.close(resolve));
        },
    };
}

module.exports.startReplayServer = startReplayServer;
module.exports.TITLES = TITLES;
