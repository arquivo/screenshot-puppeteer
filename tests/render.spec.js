const { validateUrl } = require('../app/render');
const { renderScreenshot } = require('../app/render');
const { resetAllowlist } = require('../app/allowlist');
const { startReplayServer } = require('./fixtures/replay-server');
const { Cluster } = require('puppeteer-cluster');

jest.setTimeout(60000);

// Do not inherit an allowlist from the environment, docker-compose.yml sets one.
const inheritedEnv = {
    ALLOWED_URL_PREFIXES: process.env.ALLOWED_URL_PREFIXES,
    ALLOWED_SUBRESOURCE_URL_PREFIXES: process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES,
    ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
};

function useAllowlist(env) {
    Object.keys(inheritedEnv).forEach(key => delete process.env[key]);
    Object.assign(process.env, env);
    resetAllowlist();
}

afterAll(() => {
    Object.keys(inheritedEnv).forEach(key => {
        if (inheritedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = inheritedEnv[key];
    });
    resetAllowlist();
});

test("Test if validateUrl is working correctly", () => {
    const testUrl1 = "http://covesantigas.com/image.jpg";
    const testUrl2 = "http://arquivo.pt/wayback/2018/http://sapo.pt";

    useAllowlist({ ALLOWED_DOMAINS: 'arquivo.pt,covesantigas.com' });

    expect(validateUrl(testUrl1)).toBeTruthy();
    expect(validateUrl(testUrl2)).toBeTruthy();
});

const getMimetype = (signature) => {
    switch (signature) {
        case '89504E47':
            return 'image/png'
        case '47494638':
            return 'image/gif'
        case '25504446':
            return 'application/pdf'
        case 'FFD8FFDB':
        case 'FFD8FFE0':
        case 'FFD8FFE1':
            return 'image/jpeg'
        case '504B0304':
            return 'application/zip'
        default:
            return 'Unknown filetype'
    }
};

describe("Test screenshot rendering", () => {
    let replay;
    let cluster;

    beforeAll(async () => {
        replay = await startReplayServer();

        useAllowlist({
            ALLOWED_URL_PREFIXES: replay.navigationPrefix,
            ALLOWED_SUBRESOURCE_URL_PREFIXES: replay.subresourcePrefix,
        });

        cluster = await Cluster.launch({
            // FIXME we should be able to run this in a container with sandbox mode
            puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 1,
        });
        await cluster.task(renderScreenshot);
    }, 60000);

    afterAll(async () => {
        if (cluster) await cluster.close();
        if (replay) await replay.close();
    });

    test("renders a replayed page and returns its title", async () => {
        const parametersObject = {
            url: replay.replayUrl('20200117173921', 'http://senior3045.ipportalegre.pt/'),
            type: 'png',
            width: 1280,
            height: 900,
            fullPage: true,
            timeout: 10000,
        };

        const res = await cluster.execute(parametersObject);
        expect(res[0]).toBe('Senior3045 Home page');

        const uint = new Uint8Array(res[1]);
        let bytes = [];
        uint.forEach((byte) => {
            bytes.push(byte.toString(16))
        });
        const hex = bytes.join('').toLocaleUpperCase();

        expect(getMimetype(hex.slice(0, 8))).toBe('image/png');
    });
});
