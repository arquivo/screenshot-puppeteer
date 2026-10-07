// Smoke test against the real arquivo.pt. It is deliberately NOT part of
// `npm run test`: it depends on a public service being up and fast, which made
// CI flaky. Run it on demand with `npm run test:live`, or from the
// "Test against live arquivo.pt" workflow dispatch.
//
// Assertions stay tolerant on purpose. What this checks is that the allowlist
// does not break a real pywb replay, not what any particular archived page
// looks like today.

const { Cluster } = require('puppeteer-cluster');
const allowlist = require('../app/allowlist');
const { renderScreenshot } = require('../app/render');

jest.setTimeout(180000);

const URLS = [
    'https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/',
    'https://arquivo.pt/noFrame/replay/2018/http://www.publico.pt/',
];

let cluster;
let blocked;
let originalLog;

beforeAll(async () => {
    process.env.ALLOWED_URL_PREFIXES = 'https://arquivo.pt/noFrame/replay/';
    process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES = 'https://arquivo.pt/noFrame/static/';
    delete process.env.ALLOWED_DOMAINS;
    delete process.env.ALLOW_EXTERNAL_SUBRESOURCES;
    allowlist.resetAllowlist();

    // render.js logs every refusal, which is the signal this test is after.
    blocked = [];
    originalLog = console.log;
    console.log = (...args) => {
        const line = args.join(' ');
        if (line.startsWith('Blocked ')) blocked.push(line);
        originalLog(...args);
    };

    cluster = await Cluster.launch({
        // FIXME we should be able to run this in a container with sandbox mode
        puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 1,
        timeout: 120000,
    });
    await cluster.task(renderScreenshot);
}, 120000);

afterAll(async () => {
    if (originalLog) console.log = originalLog;
    if (cluster) await cluster.close();
    delete process.env.ALLOWED_URL_PREFIXES;
    delete process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES;
    allowlist.resetAllowlist();
});

describe.each(URLS)('live replay %s', url => {
    test('renders without the allowlist refusing anything', async () => {
        blocked.length = 0;

        const [title, image] = await cluster.execute({
            url,
            type: 'png',
            width: 1280,
            height: 900,
            fullPage: true,
            timeout: 60000,
        });

        // No exact title: the archived content is outside this repository's
        // control and may legitimately change.
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
        expect(image.slice(0, 4).toString('hex').toUpperCase()).toBe('89504E47');
        expect(image.length).toBeGreaterThan(10000);

        // A replay that needs a host the allowlist does not cover is a real
        // regression, unlike arquivo.pt simply being slow.
        expect(blocked).toEqual([]);
    });
});
