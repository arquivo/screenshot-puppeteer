const allowlist = require('./allowlist');

async function renderScreenshot({page, data: parametersObject }) {

    page.setDefaultTimeout(parametersObject.timeout);

    // Chromium follows redirects and loads sub resources on its own, so the
    // allowlist has to be enforced here and not only on the entry point URL.
    let blockedNavigation = null;
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        const isNavigation = request.isNavigationRequest();

        if (allowlist.isAllowedRequest(url, { isNavigation })) {
            // Already handled requests reject, there is nothing to do about it.
            request.continue().catch(() => {});
            return;
        }

        console.log(`Blocked ${isNavigation ? 'navigation' : 'request'} to ${url}`);
        if (isNavigation && request.frame() === page.mainFrame()) {
            blockedNavigation = url;
        }
        request.abort('blockedbyclient').catch(() => {});
    });

    try {
        await page.goto(parametersObject.url, {waitUntil: 'load'});
    } catch (e) {}

    if (blockedNavigation !== null) {
        // Without this the caller would get a blank screenshot with a 200.
        const error = new Error('Navigation to a URL outside the allowlist.');
        error.code = 'BLOCKED_URL';
        throw error;
    }

    await page.setViewport({
        width: parametersObject.width,
        height: parametersObject.height
    })

    const pageTitle = await page.title();
    let result = await page.screenshot({type: parametersObject.type, fullPage: parametersObject.fullPage});
    return [ pageTitle, result ];
}

function validateUrl(urlParameter){
    return allowlist.isAllowedUrl(urlParameter);
}

module.exports.validateUrl = validateUrl;
module.exports.renderScreenshot = renderScreenshot;
