# puppeteer-webrender

Web Service that generates Web Pages Screenshots, rendering them with Chromium through Puppeteer.

## Build

```bash
docker compose build
```

## Run

```bash
docker compose up
```

### Starting

The default container cmd exposes screenshot endpoint on port 5000
- http://localhost:5000/screenshot?url=https://arquivo.pt/noFrame/replay/2018/http://www.publico.pt/

### Generating full screenshot webpage

```bash
wget -O screenshot.png http://localhost:5000/screenshot?url=https://arquivo.pt/noFrame/replay/2018/http://www.publico.pt/
```

```bash
curl --output screenshot.png http://localhost:5000/screenshot?url=https://arquivo.pt/noFrame/replay/2018/http://www.publico.pt/
```

```bash
curl --output screenshot.png http://localhost:5000/screenshot?url=https://arquivo.pt/noFrame/replay/19980205082901/http://www.caleida.pt/saramago/
```

Available query parameter options:
- download=<true or false> (default: true)
- fullpage=<true or false> (default: true)
- width=<value> (default: 1280)
- height=<value> (default: 900)


## Test

Local testing
```bash
npm install
npm run test
```

Or, run a single command that build and run tests inside docker container:

```bash
docker compose build && docker compose run --rm --remove-orphans -it webrender npm run test
```
