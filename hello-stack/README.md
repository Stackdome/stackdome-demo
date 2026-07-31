# hello-stack

A minimal three-container demo application: a web front end, a Redis queue, and a background worker.
It exists to show a multi-service deployment doing real work, with the traffic between the services
visible on the page.

| Service  | Role                                                              | Ingress |
|----------|-------------------------------------------------------------------|---------|
| `web`    | Next.js. Serves the page, accepts requests, streams events to the browser | Yes |
| `redis`  | Job queue, pub/sub fan-out, and the persistent counter             | No |
| `worker` | Consumes the queue, processes jobs, publishes progress             | No |

Pressing **Celebrate** does not run the animation directly. The browser posts a job to Redis; the
worker claims it and publishes stage events (`queued` → `claimed` → `done`); the browser renders from
those events over SSE. The `web → redis → worker` indicator therefore reflects actual message flow
rather than a scripted sequence.

## Requirements

- Docker with Compose v2

## Running

```bash
cp .env.example .env      # optional; every value has a default
docker compose up
```

The application is served at <http://localhost:3000>.

## Verifying the deployment

```bash
docker compose stop worker              # queued jobs accumulate in Redis
docker compose start worker             # the backlog is drained on startup
docker compose up -d --scale worker=3   # jobs are distributed across worker replicas
docker compose down && docker compose up # the counter and uptime survive a restart
```

## Configuration

All configuration is read from the environment at container startup, so changes take effect on
redeploy. Unrecognised values fall back to the first supported option instead of failing to start.

| Variable      | Default                   | Description |
|---------------|---------------------------|-------------|
| `CELEBRATION` | `confetti`                | Animation shown on completion: `confetti`, `lasers`, `balloons`, or `kisses` |
| `HAT`         | `party`                   | Character variant: `party`, `cap`, `crown`, or `beanie` |
| `HEADLINE`    | `Your stack is now live.` | Page heading |
| `PUBLIC_URL`  | *(empty)*                 | Overrides the URL shown and copied on the page. Empty uses the page's own address |
| `REDIS_URL`   | `redis://redis:6379`      | Redis connection string |

## Persistence

Redis is the only datastore. It runs with `--appendonly yes` against a named volume, so the
celebration count, the first-boot timestamp, and any queued jobs survive container restarts and
recreation. The worker is stateless and mounts no volume, which is what allows it to be scaled
horizontally.

## Deployment

Built as a reference application for [Stackdome](https://stackdome.io), a self-hosted PaaS for
deploying and managing workloads across Kubernetes clusters.
