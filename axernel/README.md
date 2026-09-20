# Axernel demos

Small products built on the [Axernel](https://github.com/Stackdome/axernel) agent-execution API.

- `use-cases/walkthroughpark/`: drop a GitHub repo or PR link, get a narrated demo video. See its [design](use-cases/walkthroughpark/docs/2026-09-21-walkthroughpark-design.md).
- `scratch/`: throwaway apps used as test targets.

## Run WalkThroughPark locally

Axernel must be serving on `http://127.0.0.1:8000` with execution enabled.

```sh
# 1. sandbox image (linux/amd64, public so Modal can pull it)
cd use-cases/walkthroughpark/template
docker buildx build --platform linux/amd64 -t akshaysasidrn/walkthroughpark-sandbox:latest --push .

# 2. account, project, secret, template, agent → writes use-cases/walkthroughpark/.wtp.json
cd ../bootstrap && npm install
GITHUB_TOKEN=<read-only PAT> OPENROUTER_API_KEY=<key> \
WTP_IMAGE_REF=akshaysasidrn/walkthroughpark-sandbox@sha256:<digest> npm run setup

# 3. UI
cd ../web && npm install && npm run dev
```
