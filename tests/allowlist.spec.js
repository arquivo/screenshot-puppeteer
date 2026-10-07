const allowlist = require('../app/allowlist');

const REPLAY = 'https://arquivo.pt/noFrame/replay/';

function withPrefixes(prefixes) {
    process.env.ALLOWED_URL_PREFIXES = prefixes;
    delete process.env.ALLOWED_DOMAINS;
    allowlist.resetAllowlist();
}

function withDomains(domains) {
    delete process.env.ALLOWED_URL_PREFIXES;
    process.env.ALLOWED_DOMAINS = domains;
    allowlist.resetAllowlist();
}

afterEach(() => {
    delete process.env.ALLOWED_URL_PREFIXES;
    delete process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES;
    delete process.env.ALLOWED_DOMAINS;
    delete process.env.ALLOW_EXTERNAL_SUBRESOURCES;
    allowlist.resetAllowlist();
});

describe('URL prefix allowlist', () => {
    test('allows a replay URL under the configured prefix', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replay/2018/http://www.publico.pt/')).toBe(true);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replay/20170215220854/http://www.cidadao.gov.ao/Ver.aspx?id=209')).toBe(true);
        // The prefix itself, with and without the trailing slash.
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replay/')).toBe(true);
    });

    test('rejects a path outside the prefix on an allowed host', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/')).toBe(false);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/wayback/2018/http://sapo.pt')).toBe(false);
    });

    test('matches on a path segment boundary', () => {
        withPrefixes('https://arquivo.pt/noFrame/replay');
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replayXXX/foo')).toBe(false);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replay/foo')).toBe(true);
    });

    test('rejects another host', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('https://sobre.arquivo.pt/noFrame/replay/x')).toBe(false);
        expect(allowlist.isAllowedUrl('https://evil.com/noFrame/replay/x')).toBe(false);
    });

    test('pins the scheme', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('http://arquivo.pt/noFrame/replay/x')).toBe(false);
    });

    test('rejects path traversal out of the prefix', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replay/../../admin')).toBe(false);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/noFrame/replay/%2e%2e/%2e%2e/admin')).toBe(false);
    });

    test('rejects non http schemes', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('file:///etc/passwd')).toBe(false);
        expect(allowlist.isAllowedUrl('javascript:alert(1)')).toBe(false);
        expect(allowlist.isAllowedUrl('not-a-valid-url')).toBe(false);
    });

    test('rejects internal hosts and private IP literals', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('http://127.0.0.1/')).toBe(false);
        expect(allowlist.isAllowedUrl('http://10.0.0.5/')).toBe(false);
        expect(allowlist.isAllowedUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
        expect(allowlist.isAllowedUrl('http://localhost:8787/')).toBe(false);
    });

    test('rejects credentials in the URL', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedUrl('https://user:pass@arquivo.pt/noFrame/replay/x')).toBe(false);
        expect(allowlist.isAllowedUrl('https://evil.com@arquivo.pt/noFrame/replay/x')).toBe(false);
    });

    test('accepts several prefixes and keeps the port apart', () => {
        withPrefixes('https://dev.arquivo.pt/noFrame/replay/,https://p85.arquivo.pt/noFrame/replay/');
        expect(allowlist.isAllowedUrl('https://dev.arquivo.pt/noFrame/replay/x')).toBe(true);
        expect(allowlist.isAllowedUrl('https://p85.arquivo.pt/noFrame/replay/x')).toBe(true);
        expect(allowlist.isAllowedUrl('https://preprod.arquivo.pt/noFrame/replay/x')).toBe(false);
        expect(allowlist.isAllowedUrl('https://dev.arquivo.pt:8787/noFrame/replay/x')).toBe(false);
    });

    test('throws on a malformed prefix', () => {
        withPrefixes('not-a-url');
        expect(() => allowlist.getAllowlist()).toThrow();

        withPrefixes('ftp://arquivo.pt/noFrame/replay/');
        expect(() => allowlist.getAllowlist()).toThrow();
    });
});

describe('ALLOWED_DOMAINS fallback', () => {
    test('keeps the previous host only behaviour on either scheme', () => {
        withDomains('arquivo.pt,covesantigas.com');
        expect(allowlist.isAllowedUrl('http://covesantigas.com/image.jpg')).toBe(true);
        expect(allowlist.isAllowedUrl('http://arquivo.pt/wayback/2018/http://sapo.pt')).toBe(true);
        expect(allowlist.isAllowedUrl('https://arquivo.pt/')).toBe(true);
        expect(allowlist.isAllowedUrl('https://sobre.arquivo.pt/')).toBe(false);
    });

    test('defaults to arquivo.pt', () => {
        delete process.env.ALLOWED_URL_PREFIXES;
        delete process.env.ALLOWED_DOMAINS;
        allowlist.resetAllowlist();
        expect(allowlist.isAllowedUrl('https://arquivo.pt/anything')).toBe(true);
        expect(allowlist.isAllowedUrl('https://example.org/')).toBe(false);
    });
});

describe('Request level decision', () => {
    test('blocks sub resources outside the allowlist by default', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedRequest('https://arquivo.pt/noFrame/replay/2018im_/http://a/b.png', { isNavigation: false })).toBe(true);
        expect(allowlist.isAllowedRequest('https://tracker.example/pixel.gif', { isNavigation: false })).toBe(false);
        expect(allowlist.isAllowedRequest('http://10.0.0.5/pixel.gif', { isNavigation: false })).toBe(false);
    });

    test('always allows data and blob URLs', () => {
        withPrefixes(REPLAY);
        expect(allowlist.isAllowedRequest('data:image/png;base64,AAAA', { isNavigation: false })).toBe(true);
        expect(allowlist.isAllowedRequest('blob:https://arquivo.pt/1234', { isNavigation: false })).toBe(true);
    });

    test('ALLOWED_SUBRESOURCE_URL_PREFIXES is not a valid entry point', () => {
        withPrefixes(REPLAY);
        // pywb serves wombat.js from /noFrame/static/, outside the replay prefix.
        process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES = 'https://arquivo.pt/noFrame/static/';
        allowlist.resetAllowlist();

        const wombat = 'https://arquivo.pt/noFrame/static/wombat.js';
        expect(allowlist.isAllowedRequest(wombat, { isNavigation: false })).toBe(true);
        expect(allowlist.isAllowedRequest(wombat, { isNavigation: true })).toBe(false);
        expect(allowlist.isAllowedUrl(wombat)).toBe(false);
        // It does not widen the host either.
        expect(allowlist.isAllowedRequest('https://arquivo.pt/admin', { isNavigation: false })).toBe(false);
    });

    test('ALLOW_EXTERNAL_SUBRESOURCES opens public sub resources but not private literals', () => {
        withPrefixes(REPLAY);
        process.env.ALLOW_EXTERNAL_SUBRESOURCES = 'true';
        expect(allowlist.isAllowedRequest('https://tracker.example/pixel.gif', { isNavigation: false })).toBe(true);
        expect(allowlist.isAllowedRequest('http://10.0.0.5/pixel.gif', { isNavigation: false })).toBe(false);
        expect(allowlist.isAllowedRequest('http://[::1]/pixel.gif', { isNavigation: false })).toBe(false);
        // Navigations are never relaxed.
        expect(allowlist.isAllowedRequest('https://tracker.example/', { isNavigation: true })).toBe(false);
    });
});

describe('isPrivateIpLiteral', () => {
    test('recognises private, loopback and link local literals', () => {
        ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '0.0.0.0',
         '::1', '[::1]', 'fe80::1', 'fd00::1'].forEach(host => {
            expect(allowlist.isPrivateIpLiteral(host)).toBe(true);
        });
    });

    test('leaves public literals alone', () => {
        ['8.8.8.8', '172.32.0.1', '193.136.1.1', '2001:db8::1'].forEach(host => {
            expect(allowlist.isPrivateIpLiteral(host)).toBe(false);
        });
    });
});
