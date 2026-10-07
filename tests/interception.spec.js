// Regression tests for arquivo-internal#82: Chromium follows redirects and
// loads sub resources on its own, so those have to be filtered too.
//
// Two loopback servers are used. Only the first one is on the allowlist, and
// because a prefix carries the port the second one is off limits even though
// both are 127.0.0.1.

const express = require('express');
const { Cluster } = require('puppeteer-cluster');
const allowlist = require('../app/allowlist');
const { renderScreenshot } = require('../app/render');

jest.setTimeout(60000);

let allowedServer;
let blockedServer;
let allowedOrigin;
let blockedOrigin;
let blockedHits;
let staticHits;
let cluster;

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function screenshot(url) {
    return cluster.execute({
        url,
        type: 'png',
        width: 800,
        height: 600,
        fullPage: false,
        timeout: 15000,
    });
}

beforeAll(async () => {
    blockedHits = 0;
    staticHits = 0;
    const blockedApp = express();
    blockedApp.use((request, response) => {
        blockedHits += 1;
        response.status(200).send('internal');
    });
    blockedServer = await listen(blockedApp);
    blockedOrigin = `http://127.0.0.1:${blockedServer.address().port}`;

    const allowedApp = express();
    allowedApp.get('/allowed/page', (request, response) => {
        response.send(`<html><head><title>Allowed page</title></head>
            <body><img src="${blockedOrigin}/pixel.png"></body></html>`);
    });
    allowedApp.get('/allowed/static-page', (request, response) => {
        response.send(`<html><head><title>Static page</title>
            <script src="/static/wombat.js"></script></head><body>hello</body></html>`);
    });
    allowedApp.get('/static/wombat.js', (request, response) => {
        staticHits += 1;
        response.type('application/javascript').send('window.__wombat = true;');
    });
    allowedApp.get('/allowed/redirect', (request, response) => {
        response.redirect(302, `${blockedOrigin}/secret`);
    });
    allowedApp.get('/allowed/redirect-private', (request, response) => {
        response.redirect(302, 'http://169.254.169.254/latest/meta-data/');
    });
    allowedApp.get('/outside', (request, response) => {
        response.send('<html><head><title>Outside</title></head><body>outside</body></html>');
    });
    allowedServer = await listen(allowedApp);
    allowedOrigin = `http://127.0.0.1:${allowedServer.address().port}`;

    process.env.ALLOWED_URL_PREFIXES = `${allowedOrigin}/allowed/`;
    process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES = `${allowedOrigin}/static/`;
    delete process.env.ALLOWED_DOMAINS;
    delete process.env.ALLOW_EXTERNAL_SUBRESOURCES;
    allowlist.resetAllowlist();

    cluster = await Cluster.launch({
        puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 1,
        timeout: 30000,
    });
    await cluster.task(renderScreenshot);
}, 60000);

afterAll(async () => {
    if (cluster) await cluster.close();
    if (allowedServer) allowedServer.close();
    if (blockedServer) blockedServer.close();
    delete process.env.ALLOWED_URL_PREFIXES;
    allowlist.resetAllowlist();
});

beforeEach(() => {
    blockedHits = 0;
    staticHits = 0;
});

test('renders a page that is inside the allowlist', async () => {
    const [title, image] = await screenshot(`${allowedOrigin}/allowed/page`);
    expect(title).toBe('Allowed page');
    expect(image.length).toBeGreaterThan(0);
});

test('a redirect out of the allowlist is blocked and never reaches the target', async () => {
    await expect(screenshot(`${allowedOrigin}/allowed/redirect`))
        .rejects.toMatchObject({ code: 'BLOCKED_URL' });
    expect(blockedHits).toBe(0);
});

test('a redirect to a private IP is blocked', async () => {
    await expect(screenshot(`${allowedOrigin}/allowed/redirect-private`))
        .rejects.toMatchObject({ code: 'BLOCKED_URL' });
});

test('a sub resource out of the allowlist never reaches the target', async () => {
    const [title] = await screenshot(`${allowedOrigin}/allowed/page`);
    expect(title).toBe('Allowed page');
    expect(blockedHits).toBe(0);
});

test('a path outside the allowlist on the same host is blocked', async () => {
    await expect(screenshot(`${allowedOrigin}/outside`))
        .rejects.toMatchObject({ code: 'BLOCKED_URL' });
});

test('a sub resource only prefix loads but is not a valid entry point', async () => {
    const [title] = await screenshot(`${allowedOrigin}/allowed/static-page`);
    expect(title).toBe('Static page');
    expect(staticHits).toBe(1);

    await expect(screenshot(`${allowedOrigin}/static/wombat.js`))
        .rejects.toMatchObject({ code: 'BLOCKED_URL' });
});
