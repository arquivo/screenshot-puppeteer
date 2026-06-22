const app_export = require('../app/app');
const { Cluster } = require('puppeteer-cluster');
const supertest = require('supertest');

jest.setTimeout(60000);

let cluster;
let request;

beforeAll(async () => {
  request = supertest(app_export);

  // Wait for app to be ready with retry logic
  let ready = false;
  let attempts = 0;
  while (!ready && attempts < 30) {
    try {
      const res = await request.get('/screenshot/health');
      if (res.status === 200) {
        ready = true;
      }
    } catch (err) {
      // Ignore errors during warmup
    }
    if (!ready) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
  }

  cluster = await Cluster.launch({
    // FIXME we should be able to run this in a container with sandbox mode
    puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 5,
  });
}, 60000);

afterAll(async () => {
  if (cluster) {
    await cluster.close();
  }
});

describe('Test GET /', () => {
    test('Service up status code', async () => {        
        const res = await request.get('/');
        expect(res.status).toBe(200);
    });
});

describe('Test GET /screenshot', () => {
    test('Getting a screenshot image', async () => {
        const res = await request.get('/screenshot?url=https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/&download=false');
        expect(res.status).toBe(200);
        expect(res.header['content-type']).toBe('image/png');
        expect(Buffer.isBuffer(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(1000);
    });

    test('Getting a downloadable screenshot image', async () => {
      const fileName = 'jose-saramago-home-page-19980205082901.png';
      const res = await request.get('/screenshot?url=https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/&download=true');

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/octet-stream');
      expect(res.header['content-disposition']).toBe(`attachment; filename=${fileName}`);
      expect(Buffer.isBuffer(res.body)).toBe(true);
    });

    test('Requesting a screenshot image with a specific resolution (800x900)', async () => {
        const res = await request.get('/screenshot?url=https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/&width=800&height=900');
        expect(res.status).toBe(200);
        expect(res.header['content-type']).toBe('application/octet-stream');
        expect(res.body.length).toBeGreaterThan(10000);
    });

    test('Requesting not allowed domain url screenshot', async () => {
        const res = await request.get('/screenshot?url=https://sobre.arquivo.pt/');
        expect(res.status).toBe(400);
        expect(res.text).toEqual(expect.stringContaining("Wrong URL to execute the screenshot."));
    });

    test('Requesting not fullpage screenshot', async () => {
        const res = await request.get('/screenshot?url=https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/&fullpage=false');
        expect(res.status).toBe(200);
        expect(res.header['content-type']).toBe('application/octet-stream');
        expect(res.body.length).toBeGreaterThan(1000);
    });

    test('Requesting page that needs URL Encoding', async () => {
        const encodedUrl = encodeURIComponent('https://arquivo.pt/noFrame/replay/20170215220854/http://www.cidadao.gov.ao/VerServicoPDFPrint.aspx?id=209&tipo=imprimir');
        const res = await request.get(`/screenshot?url=${encodedUrl}&download=true`);
        expect(res.status).toBe(200);
        expect(res.header['content-type']).toBe('application/octet-stream');
        expect(res.header['content-disposition']).toContain('attachment; filename=');
        expect(Buffer.isBuffer(res.body)).toBe(true);
    });

    // Additional test cases to consider
    test('Missing URL parameter returns error', async () => {
        const res = await request.get('/screenshot');
        expect(res.status).toBe(400);
    });

    test('Invalid URL parameter returns error', async () => {
        const res = await request.get('/screenshot?url=not-a-valid-url');
        expect(res.status).toBe(400);
    });

    // test('Timeout on slow-loading page', async () => {
    //     // Test with a timeout parameter if supported
    //     const res = await request.get('/screenshot?url=https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/&timeout=1');
    //     // Expect either success or timeout error
    //     expect([200, 408, 504]).toContain(res.status);
    // }, 10000); // Increase Jest timeout for this test
});