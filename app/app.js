const express = require('express');
const render = require('./render');
const utils = require('./utils');
const allowlist = require('./allowlist');
const { Cluster } = require('puppeteer-cluster');

const timeout = process.env.SCREENSHOT_TIMEOUT || 45000;
const type = process.env.SCREENSHOT_TYPE || 'png';
const maxConcurrency = process.env.MAX_CONCURRENCY || 5;

let width = process.env.SCREENSHOT_WIDTH || 1280;
let height = process.env.SCREENSHOT_HEIGHT || 900;

// launch server
const app = express();

const allowed = allowlist.describeAllowlist();
console.log("Allowed URL prefixes: " + allowed.navigation.join(', '));
console.log("Allowed sub resource only URL prefixes: " + (allowed.subresourceOnly.join(', ') || '(none)'));

let cluster;
let isReady = false;

// Initialize cluster
(async () => {
  cluster = await Cluster.launch({
    // FIXME we should be able to run this in a container with sandbox mode
    puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: maxConcurrency,
    timeout: timeout * 2
  });

  await cluster.task(render.renderScreenshot);
  isReady = true;
})();

const healthCheck = function (request, response) {
  if (!isReady) {
    return response.status(503).send("Service starting up...");
  }
  response.status(200).send("OK - Service Ready");
}

app.get('/screenshot/health', healthCheck);
app.get('/', healthCheck);

app.get('/screenshot(/)?', async function (request, response) {
  if (!isReady || !cluster) {
    return response.status(503).send("Service not ready yet");
  }

  width = isNaN(request.query.width) ? width : parseInt(request.query.width);
  height = isNaN(request.query.height) ? height : parseInt(request.query.height);
  let downloadImage = (request.query.download == null) ? true : utils.textBoolean(request.query.download);
  let fullPage = (request.query.fullpage == null) ? true : utils.textBoolean(request.query.fullpage);

  // verify the URL is covered by the allowlist. if not allowed return forbidden operation. if not continue.
  let urlParameter = null;
  if (typeof request.query.url === 'string') {
    try {
      urlParameter = decodeURI(request.query.url);
    } catch (error) {
      // decodeURI throws URIError on a malformed percent sequence.
    }
  }

  console.log("Starting taking screenshot for URL " + urlParameter)
  let validUrl = urlParameter !== null && render.validateUrl(urlParameter);
  if (!validUrl) {
    response.status(400).send("Wrong URL to execute the screenshot.");
  } else {
    var parametersObject = new Object();
    parametersObject.url = urlParameter;
    parametersObject.type = type;
    parametersObject.width = width;
    parametersObject.height = height;
    parametersObject.fullPage = fullPage;
    parametersObject.timeout = timeout;

    try {
      const res = await cluster.execute(parametersObject);

      screenshotContent = res[1];
      if (downloadImage) {
        let timestamp = utils.extractTimeWaybackUrl(request.query.url);
        let ts = timestamp != null ? `-${timestamp}` : '';

        // TODO ugh refactor this
        fileName = utils.removeDiacritics(res[0]).replace(/[^a-z0-9]/gi, '-').replace(/[-]+/g, '-').toLowerCase().substring(0, 30) + ts + '.png';
        response.set({
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename=${fileName}`
        }).send(screenshotContent);
      }
      else {
        response.set('Content-Type', 'image/' + type).send(screenshotContent);
      }
    } catch (error) {
      if (error.code === 'BLOCKED_URL') {
        // Same generic message, so nothing is disclosed about what is reachable.
        console.warn('Blocked screenshot:', error.message);
        return response.status(400).send("Wrong URL to execute the screenshot.");
      }
      console.error('Screenshot error:', error);
      response.status(500).send("Something went wrong taking the screenshot.");
    }
  }
});

module.exports = app;