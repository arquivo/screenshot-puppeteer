async function renderScreenshot({page, data: parametersObject }) {

    page.setDefaultTimeout(parametersObject.timeout);

    try {
        await page.goto(parametersObject.url, {waitUntil: 'load'});
    } catch (e) {}

    await page.setViewport({
        width: parametersObject.width,
        height: parametersObject.height
    })
    
    const pageTitle = await page.title();
    let result = await page.screenshot({type: parametersObject.type, fullPage: parametersObject.fullPage});
    return [ pageTitle, result ];
}

function validateUrl(urlParameter, allowedDomains){        
    try {
        let url = new URL(urlParameter);
        const host = url.host;
        let result = false;

        allowedDomains.forEach(element => {
            if (host == element) result = true;
        });
        return result;
    }
    catch(error) {
        console.log('Error validating the URL', error);
        return null;
    };
}

module.exports.validateUrl = validateUrl;
module.exports.renderScreenshot = renderScreenshot;
