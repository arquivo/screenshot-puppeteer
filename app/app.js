const express = require('express');
const render = require('./render');
const utils = require('./utils');
const { Cluster } = require('puppeteer-cluster');

const allowedDomains = process.env.ALLOWED_DOMAINS || 'arquivo.pt'; // accept multiple values comma separated
const timeout = process.env.SCREENSHOT_TIMEOUT || 45000;
const type = process.env.SCREENSHOT_TYPE || 'png';
const maxConcurrency = process.env.MAX_CONCURRENCY || 5;

let width = process.env.SCREENSHOT_WIDTH || 1280;
let height = process.env.SCREENSHOT_HEIGHT || 900;

// launch server
const app = express();

// launch puppetter cluster
(async () => {
  const cluster = await Cluster.launch({
    // FIXME we should be able to run this in a container with sandbox mode
    puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: maxConcurrency,
    timeout: timeout * 2
  });

  await cluster.task(render.renderScreenshot);

  app.get('/', async function (request, response) {
    response.status(200).send("OK - Service Ready")
  });

  app.get('/screenshot(/)?', async function (request, response)  {

    width = isNaN(request.query.width) ? width : parseInt(request.query.width);
    height = isNaN(request.query.height) ? height : parseInt(request.query.height);
    let downloadImage = (request.query.download == null)  ? true : utils.textBoolean(request.query.download);
    let fullPage = (request.query.fullpage == null) ? true : utils.textBoolean(request.query.fullpage);

    // verify if root domain match. if not allowed return forbidden operation. if not continue.
    const allowedDomainsArray = allowedDomains.split(',');

    let urlParameter = decodeURI(request.query.url);
    console.log("Starting taking screenshot for URL " +  urlParameter)
    let validUrl = render.validateUrl(urlParameter, allowedDomainsArray);
    if (!validUrl){
      response.status(405).send("Wrong URL to execute the screenshot.");
    }
    else {
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
          fileName = utils.removeDiacritics(res[0]).replace(/[^a-z0-9]/gi, '-').replace(/[-]+/g,'-').toLowerCase().substring(0,30) + ts +'.png';
          response.set({
            'Content-Type': 'application/octect-stream',
            'Content-Disposition': `attachment; filename=${fileName}`
          }).send(screenshotContent);
        }
        else {
          response.set('Content-Type', 'image/' + type).send(screenshotContent);
        }
      } catch(error)  {
        response.status(500).send("Something went wrong taking the screenshot.");
      }
    }
  });
})();

module.exports = app;
