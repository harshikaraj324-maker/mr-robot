import { Router, type IRouter, type Request, type Response } from "express";
import { env } from "../lib/env";
import { logEntry, trafficLog, subscribe } from "../lib/trafficLog";

const router: IRouter = Router();

/* ── Proxy on/off state (in-memory) ─────────────────────────────── */
let proxyEnabled = true;

router.get("/relay-state", (_req: Request, res: Response) => {
  res.json({ enabled: proxyEnabled });
});

router.post("/relay-toggle", (_req: Request, res: Response) => {
  proxyEnabled = !proxyEnabled;
  res.json({ enabled: proxyEnabled });
});

/**
 * Proxy relay — forwards all requests to the real backend.
 * Returns 503 when proxy is disabled via /api/relay-toggle.
 */
router.all("/relay/*splat", async (req: Request, res: Response) => {
  const splat: string = (req.params as Record<string, string>)["splat"] ?? "";
  const qs   = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const path = `/${splat}`;
  const method = req.method.toUpperCase();
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "?";
  const t = Date.now();

  /* ── Proxy is OFF ───────────────────────────────────────────── */
  if (!proxyEnabled) {
    logEntry({
      ts: new Date().toISOString(),
      method, path, ip,
      body: req.body ?? null,
      status: 503,
      responseSnippet: "Proxy disabled",
      ms: Date.now() - t,
    });
    res.status(503).json({ error: "Proxy disabled", message: "The relay is currently turned off." });
    return;
  }

  /* ── Forward to real backend ────────────────────────────────── */
  const hasBody   = ["POST", "PUT", "PATCH"].includes(method);
  const targetUrl = `${env.proxyTarget}${path}${qs}`;

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: { "content-type": "application/json" },
      ...(hasBody ? { body: JSON.stringify(req.body) } : {}),
    });

    const text    = await upstream.text();
    const snippet = text.length > 300 ? text.slice(0, 300) + "…" : text;

    logEntry({
      ts: new Date().toISOString(),
      method, path, ip,
      body: req.body ?? null,
      status: upstream.status,
      responseSnippet: snippet,
      ms: Date.now() - t,
    });

    res
      .status(upstream.status)
      .setHeader("content-type", upstream.headers.get("content-type") ?? "application/json")
      .send(text);
  } catch (err) {
    logEntry({
      ts: new Date().toISOString(),
      method, path, ip,
      body: req.body ?? null,
      status: 502,
      responseSnippet: String(err),
      ms: Date.now() - t,
    });
    res.status(502).json({ error: "Proxy error", detail: String(err) });
  }
});

/** GET /api/relay-log — last 200 entries (initial load) */
router.get("/relay-log", (_req: Request, res: Response) => {
  res.json(trafficLog);
});

/**
 * GET /api/relay-stream — SSE stream.
 * Dashboard subscribes once; server pushes each new entry instantly.
 * No polling, no DB reads.
 */
router.get("/relay-stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  /* send current state so dashboard can hydrate immediately */
  res.write(`data: ${JSON.stringify({ type: "init", log: trafficLog, enabled: proxyEnabled })}\n\n`);

  /* push every new entry */
  const unsub = subscribe(entry => {
    res.write(`data: ${JSON.stringify({ type: "entry", entry })}\n\n`);
  });

  /* keep-alive ping every 20 s so proxies don't close the connection */
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);

  req.on("close", () => { unsub(); clearInterval(ping); });
});

export default router;
