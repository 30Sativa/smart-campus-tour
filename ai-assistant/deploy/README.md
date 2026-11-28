# Deploying ai-assistant to production

The Student Q&A service runs as its own container on the **backend EC2 host**,
next to the API (`backend/docs/ec2-deployment.md`). It is a separate deploy unit:
the backend release scripts never start, stop or roll it back, and this folder
never touches the backend stack.

```text
browser --> api.<domain> (backend API container) --http://ai-assistant:8090--> ai-assistant --> Anthropic API
```

- No host port is published. The container joins the backend Compose network
  `campustour_outbound` with the alias `ai-assistant`; only containers on that
  network reach it, and the same network gives it outbound internet.
- The backend authenticates with `Authorization: Bearer <AI_SERVICE_KEY>`.
- The approved content pack (`ai-assistant/content/`) is baked into the image,
  so a content change ships by the same workflow.

## Files

| File | Runs on | Purpose |
|---|---|---|
| `ai-assistant/Dockerfile` | CI | image, non-root, `/health` health check |
| `ai-assistant/deploy/docker-compose.yml` | EC2 | Compose project `campustour-ai` |
| `ai-assistant/deploy/deploy-host.sh` | EC2, root | pull digest, start, check API → assistant reachability |
| `ai-assistant/deploy/ssh-deploy.sh` | Actions runner | copy the two files above and run `deploy-host.sh` over SSH |
| `ai-assistant/deploy/ai-assistant.env.example` | — | template for `/etc/campustour/ai-assistant.env` |
| `.github/workflows/ai-assistant-deploy.yml` | GitHub Actions | build/push `ghcr.io/30sativa/smart-campus-tour/ai-assistant`, then deploy |

The workflow uses the same `production` environment, `DEPLOY_SSH_*` variables
and secrets as Backend Deploy. It runs after **AI Assistant Verify** succeeds for
a push to `main`, or manually (Actions → AI Assistant Deploy → Run workflow on `main`).

## One-time setup on the EC2 host

1. Create the assistant's secrets file (never commit it):

   ```bash
   sudo install -o root -g root -m 0600 /dev/null /etc/campustour/ai-assistant.env
   sudo nano /etc/campustour/ai-assistant.env   # fill from ai-assistant/deploy/ai-assistant.env.example
   ```

   Set `AI_SERVICE_KEY` (`openssl rand -hex 32`), `AI_PROVIDER=anthropic` and
   `ANTHROPIC_API_KEY`.

2. Point the backend at it: add to `/etc/campustour/api.env`

   ```text
   AiAssistant__BaseUrl=http://ai-assistant:8090
   AiAssistant__ServiceKey=<the same value as AI_SERVICE_KEY>
   ```

3. Run **AI Assistant Deploy** (manually the first time). It fails early if the
   env file is missing, not mode 0600, or the backend network does not exist yet.

4. The API reads `api.env` only when its container is created. Backend Deploy
   refuses to redeploy the release that is already active ("Selected application
   release is already active"), and skips commits that did not change the backend,
   so recreate only the API container of the active release on the host. Same
   image, database untouched, a few seconds of API downtime. `/opt/campustour` is
   root-only, so use absolute paths instead of `cd`:

   ```bash
   sudo docker compose --project-name campustour \
     --env-file /etc/campustour/backend.env \
     --env-file /opt/campustour/current/release.env \
     -f /opt/campustour/current/docker-compose.yml \
     up -d --no-deps --force-recreate --wait api
   ```

   Any later Backend Deploy also creates a fresh API container that reads `api.env`.

## Check

```bash
sudo docker ps --filter label=com.docker.compose.project=campustour-ai
sudo docker logs --tail 50 campustour-ai-ai-assistant-1      # JSON lines; no question text

# API side: prints http://ai-assistant:8090, then 200 (does not print the key)
api=$(sudo docker ps -q --filter label=com.docker.compose.project=campustour --filter label=com.docker.compose.service=api | head -n1)
sudo docker exec "$api" printenv AiAssistant__BaseUrl
sudo docker exec "$api" curl -s -o /dev/null -w '%{http_code}\n' http://ai-assistant:8090/health
```

An empty `printenv` line means the API container was not recreated after editing `api.env` (step 4).

Then open an **individual** invitation link on the real site and ask in **Hỏi AI**.
A 503 "AI bận" means: assistant down, keys differ between the two files, the API
container was not recreated after editing `api.env`, or the Anthropic account
has no credit.

## Limits

- Memory: limited to 256 MiB. The 4 GiB host also runs SQL Server and, during a
  backend deploy, two API containers; Backend Deploy refuses to start its
  candidate below 768 MiB available. Check `free -m` after the first start.
- If the backend `campustour_outbound` network is ever recreated (first install,
  manual `docker compose down`), rerun AI Assistant Deploy to reattach.
- No rollback automation: to go back, rerun the workflow on an earlier `main`
  commit. The assistant is stateless.
- ADR-0020 targets answers from an approved bank; this deploys the current
  provider-backed implementation (`docs/architecture.md` §7.1).
