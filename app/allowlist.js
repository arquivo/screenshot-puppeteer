// Allowlist of URL prefixes the screenshot service is permitted to load.
//
// Configure with ALLOWED_URL_PREFIXES, a comma separated list of complete
// prefixes (scheme + host + path), e.g.
//     ALLOWED_URL_PREFIXES=https://arquivo.pt/noFrame/replay/
// ALLOWED_SUBRESOURCE_URL_PREFIXES adds prefixes that sub resources may use but
// that are not valid entry points, typically the pywb static assets
// (/noFrame/static/wombat.js and friends).
// ALLOWED_DOMAINS is kept as a fallback when ALLOWED_URL_PREFIXES is unset and
// only restricts the host, which is the behaviour this service had before.

const PRIVATE_IPV4 = [
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
];

let navigationAllowlist = null;
let subresourceAllowlist = null;

// Parses a single prefix entry. Throws on a malformed entry so a bad deployment
// template fails at startup instead of silently allowing nothing.
function parsePrefix(raw) {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Allowed URL prefix must be http or https: ${raw}`);
    }
    // url.host keeps a non default port, url.pathname is already normalized
    // (`..` and `%2e%2e` segments are resolved away).
    return { protocol: url.protocol, host: url.host, path: url.pathname };
}

function parsePrefixList(value) {
    if (!value) return [];
    return value.split(',').filter(entry => entry.trim() !== '').map(parsePrefix);
}

function buildNavigationAllowlist() {
    if (process.env.ALLOWED_URL_PREFIXES) {
        return parsePrefixList(process.env.ALLOWED_URL_PREFIXES);
    }

    // Fallback: host only matching, on either scheme (protocol null).
    const domains = process.env.ALLOWED_DOMAINS || 'arquivo.pt';
    return domains.split(',')
        .map(domain => domain.trim())
        .filter(domain => domain !== '')
        .map(domain => ({ protocol: null, host: domain, path: '/' }));
}

function getAllowlist() {
    if (navigationAllowlist === null) navigationAllowlist = buildNavigationAllowlist();
    return navigationAllowlist;
}

function getSubresourceAllowlist() {
    if (subresourceAllowlist === null) {
        subresourceAllowlist = getAllowlist().concat(parsePrefixList(process.env.ALLOWED_SUBRESOURCE_URL_PREFIXES));
    }
    return subresourceAllowlist;
}

// Only used by the tests, to pick up a changed environment.
function resetAllowlist() {
    navigationAllowlist = null;
    subresourceAllowlist = null;
}

function formatPrefix(prefix) {
    return `${prefix.protocol || '(http|https)'}//${prefix.host}${prefix.path}`;
}

function describeAllowlist() {
    const extra = getSubresourceAllowlist().slice(getAllowlist().length);
    return {
        navigation: getAllowlist().map(formatPrefix),
        subresourceOnly: extra.map(formatPrefix),
    };
}

function matchesPrefix(url, prefix) {
    if (prefix.protocol !== null && url.protocol !== prefix.protocol) return false;
    if (url.host !== prefix.host) return false;
    if (url.pathname === prefix.path) return true;
    // Compare on a segment boundary so /noFrame/replay does not match
    // /noFrame/replayXXX. Paths are case sensitive, pywb routes are too.
    const base = prefix.path.endsWith('/') ? prefix.path : prefix.path + '/';
    return url.pathname.startsWith(base);
}

function matchesAllowlist(rawUrl, prefixes) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch (error) {
        return false;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // https://evil.com@arquivo.pt/... parses with host arquivo.pt and would
    // otherwise pass, making Chromium send the credentials along.
    if (url.username !== '' || url.password !== '') return false;

    return prefixes.some(prefix => matchesPrefix(url, prefix));
}

// Entry point check, also used for every navigation Chromium makes.
function isAllowedUrl(rawUrl) {
    return matchesAllowlist(rawUrl, getAllowlist());
}

// Syntactic check only, no DNS resolution.
function isPrivateIpLiteral(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
        return true;
    }
    return PRIVATE_IPV4.some(range => range.test(host));
}

// Decision taken for every request Chromium makes, including each hop of a
// redirect chain and every sub resource.
function isAllowedRequest(rawUrl, { isNavigation } = {}) {
    // No network egress, and Chromium uses them for inlined content.
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return true;

    if (isNavigation) return isAllowedUrl(rawUrl);

    if (matchesAllowlist(rawUrl, getSubresourceAllowlist())) return true;
    if (process.env.ALLOW_EXTERNAL_SUBRESOURCES !== 'true') return false;

    let url;
    try {
        url = new URL(rawUrl);
    } catch (error) {
        return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return !isPrivateIpLiteral(url.hostname);
}

module.exports.parsePrefix = parsePrefix;
module.exports.getAllowlist = getAllowlist;
module.exports.getSubresourceAllowlist = getSubresourceAllowlist;
module.exports.resetAllowlist = resetAllowlist;
module.exports.describeAllowlist = describeAllowlist;
module.exports.isAllowedUrl = isAllowedUrl;
module.exports.isAllowedRequest = isAllowedRequest;
module.exports.isPrivateIpLiteral = isPrivateIpLiteral;
