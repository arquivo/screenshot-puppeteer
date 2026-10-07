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


## Restricting what can be rendered

The service loads a user supplied URL in a browser, so it is restricted to an
allowlist of URL prefixes. Everything else is refused with
`400 Wrong URL to execute the screenshot.`

The allowlist is enforced twice: on the `url` query parameter, and on every
request the browser makes afterwards. That second check is what covers
redirects and sub resources, which the browser follows on its own.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_URL_PREFIXES` | *(unset)* | Comma separated list of complete prefixes (scheme + host + path) that may be rendered. |
| `ALLOWED_SUBRESOURCE_URL_PREFIXES` | *(unset)* | Extra prefixes that sub resources may use, but that are not valid entry points. |
| `ALLOWED_DOMAINS` | `arquivo.pt` | Fallback used only when `ALLOWED_URL_PREFIXES` is unset. Matches on host alone, on either scheme. |
| `ALLOW_EXTERNAL_SUBRESOURCES` | `false` | Set to `true` to let sub resources reach any public host. Private, loopback and link local **IP literals** stay blocked, but no DNS resolution is done, so a public name pointing at an internal address is not caught. |

A prefix pins the scheme, the host (including a non default port) and the path,
and matches on a path segment boundary, so `https://arquivo.pt/noFrame/replay/`
allows `https://arquivo.pt/noFrame/replay/2018/http://www.publico.pt/` but not
`https://arquivo.pt/`, not `http://arquivo.pt/noFrame/replay/` and not
`https://arquivo.pt/noFrame/replayXXX/`. Paths are case sensitive, mind the
capital `F` in `noFrame`. A malformed entry makes the service fail at startup
rather than silently accept nothing.

pywb serves its client side rewriting code (`wombat.js`) from `/noFrame/static/`,
outside the replay prefix, so that path belongs in
`ALLOWED_SUBRESOURCE_URL_PREFIXES`. Per environment:

```bash
# production
ALLOWED_URL_PREFIXES=https://arquivo.pt/noFrame/replay/
ALLOWED_SUBRESOURCE_URL_PREFIXES=https://arquivo.pt/noFrame/static/

# pre-production
ALLOWED_URL_PREFIXES=https://preprod.arquivo.pt/noFrame/replay/
ALLOWED_SUBRESOURCE_URL_PREFIXES=https://preprod.arquivo.pt/noFrame/static/

# development
ALLOWED_URL_PREFIXES=https://dev.arquivo.pt/noFrame/replay/
ALLOWED_SUBRESOURCE_URL_PREFIXES=https://dev.arquivo.pt/noFrame/static/
```

The effective allowlist is logged at startup, and every refused request is
logged as `Blocked request to ...` or `Blocked navigation to ...`, which is the
place to look if a screenshot comes out incomplete.


## Test

The default suite is hermetic: it serves its own pywb-like replay fixture from
a loopback port (`tests/fixtures/replay-server.js`) and never touches the
network, so it is fast and cannot fail because arquivo.pt is slow.

```bash
npm install
npm run test
```

Or, run a single command that build and run tests inside docker container:

```bash
docker compose build && docker compose run --rm --remove-orphans -it webrender npm run test
```

There is a separate smoke test against the real arquivo.pt. It is not part of
`npm run test` and does not gate CI, because the service being up and fast is
outside this repository's control. It checks that a real replay still renders
with nothing refused by the allowlist, which is worth running whenever the
allowlist or the request filtering changes.

```bash
npm run test:live
```

In CI it is the *Test against live arquivo.pt* job, triggered manually from the
Actions tab (`workflow_dispatch`).
