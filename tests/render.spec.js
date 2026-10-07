const { validateUrl } = require('../app/render');
const { renderScreenshot } = require('../app/render');
const { resetAllowlist } = require('../app/allowlist');
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

test("Test screenshot rendering", async () => {

    useAllowlist({
        ALLOWED_URL_PREFIXES: 'https://arquivo.pt/noFrame/replay/',
        ALLOWED_SUBRESOURCE_URL_PREFIXES: 'https://arquivo.pt/noFrame/static/',
    });

    // setup task
    const cluster = await Cluster.launch({
        // FIXME we should be able to run this in a container with sandbox mode
        puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },  
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 1,
    })

    await cluster.task(renderScreenshot);

    var parametersObject = new Object();
    parametersObject.url = 'https://arquivo.pt/noFrame/replay/20200117173921/http://senior3045.ipportalegre.pt/';
    parametersObject.type = 'png';
    parametersObject.width = 1280;
    parametersObject.height = 900;
    parametersObject.fullPage = true;
    parametersObject.timeout = 10000;

    let res = await cluster.execute(parametersObject);
    expect(res[0]).toBe('Senior3045 Home page');

    const uint = new Uint8Array(res[1]);
    let bytes = [];
    uint.forEach((byte) => {
        bytes.push(byte.toString(16))
    });
    const hex = bytes.join('').toLocaleUpperCase();

    expect(getMimetype(hex.slice(0,8))).toBe('image/png');
});