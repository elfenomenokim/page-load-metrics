// Page load metrics read inside the page with the browser's own performance entries.
// Evaluate after a load, e.g.
//   bsk reload --hard --session SID && bsk evaluate --json --session SID "$(cat page_load_metrics.js)"
// Returns one JSON object; every number is milliseconds unless named *_kb or cls.
// Ratings follow web.dev / Lighthouse lab bands; blocking_ms approximates TBT.
/*
 * Reads the load timing of the page it runs in. Override the post-load settle wait with
 * `globalThis.PAGE_LOAD_METRICS_SETTLE_MS` (milliseconds, default 2000); any other
 * value, including 0, is used as-is when it is a finite non-negative number.
 */
(async () => {
  const SETTLE_MS = (() => {
    const raw = Number(globalThis.PAGE_LOAD_METRICS_SETTLE_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 2000;
  })();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.readyState !== "complete") {
    await new Promise((r) => addEventListener("load", r, { once: true }));
  }
  await sleep(SETTLE_MS);

  const supported = PerformanceObserver.supportedEntryTypes || [];
  const buffered = async (type) => {
    if (!supported.includes(type)) return null;
    const out = [];
    const po = new PerformanceObserver((l) => out.push(...l.getEntries()));
    po.observe({ type, buffered: true });
    await sleep(50);
    out.push(...po.takeRecords());
    po.disconnect();
    return out;
  };
  const round = (v) => (v == null ? null : Math.round(v));
  const kb = (b) => Math.round(b / 102.4) / 10;
  const short = (u) => {
    try {
      const x = new URL(u, location.href);
      return (x.origin === location.origin ? "" : x.host) + x.pathname.slice(-60);
    } catch { return String(u).slice(-60); }
  };
  const desc = (el) => {
    if (!el || !el.tagName) return null;
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2) : [];
    if (cls[0]) s += "." + cls.join(".");
    if (el.currentSrc || el.src) s += " " + short(el.currentSrc || el.src);
    else if (el.textContent) s += ' "' + el.textContent.trim().slice(0, 30) + '"';
    return s;
  };
  const rate = (v, good, poor) => (v == null ? null : v <= good ? "good" : v <= poor ? "needs-improvement" : "poor");

  const nav = performance.getEntriesByType("navigation")[0];
  const ttfb = nav ? Math.max(0, nav.responseStart - (nav.activationStart || 0)) : null;
  const paints = (await buffered("paint")) || performance.getEntriesByType("paint");
  const fcp = paints.find((e) => e.name === "first-contentful-paint")?.startTime ?? null;

  const resources = performance.getEntriesByType("resource");
  const lcpEntry = ((await buffered("largest-contentful-paint")) || []).at(-1) || null;
  let lcp = null;
  if (lcpEntry) {
    // Text elements produce LCP entries without a resource; their load phases are zero.
    // Without navigation timing the phases are unknown (null), never computed from zero.
    const res = lcpEntry.url ? resources.find((r) => r.name === lcpEntry.url) : null;
    const base = ttfb ?? 0;
    const loadStart = res ? Math.max(base, res.requestStart || res.startTime) : base;
    const loadEnd = res ? Math.max(loadStart, res.responseEnd) : base;
    const at = Math.max(loadEnd, lcpEntry.startTime);
    const phase = (v) => (ttfb == null ? null : round(v));
    lcp = {
      ms: round(at),
      element: desc(lcpEntry.element) || (lcpEntry.url ? short(lcpEntry.url) : "(removed from the page)"),
      size: lcpEntry.size,
      ttfb: round(ttfb),
      load_delay: phase(loadStart - base),
      load_duration: phase(loadEnd - loadStart),
      render_delay: phase(at - loadEnd),
    };
  }

  // An entry type the browser does not support is unknown (null), not a good zero.
  const shiftEntries = await buffered("layout-shift");
  const shifts = (shiftEntries || []).filter((e) => !e.hadRecentInput);
  let cls = 0, win = 0, winStart = 0, prev = 0;
  for (const e of shifts) {
    if (win && (e.startTime - prev > 1000 || e.startTime - winStart > 5000)) win = 0;
    if (!win) winStart = e.startTime;
    win += e.value;
    prev = e.startTime;
    cls = Math.max(cls, win);
  }
  const shiftSources = shifts
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((e) => ({
      at: round(e.startTime),
      value: Math.round(e.value * 1000) / 1000,
      nodes: (e.sources || []).map((s) => desc(s.node)).filter(Boolean).slice(0, 2),
    }));

  // Main-thread blocking after FCP: long animation frames, else long tasks.
  let blocking = null;
  const loaf = await buffered("long-animation-frame");
  if (loaf) {
    const after = loaf.filter((f) => fcp == null || f.startTime >= fcp);
    const scripts = after.flatMap((f) => f.scripts || []).sort((a, b) => b.duration - a.duration);
    blocking = {
      source: "long-animation-frame",
      frames: after.length,
      blocking_ms: round(after.reduce((s, f) => s + f.blockingDuration, 0)),
      longest_ms: round(Math.max(0, ...after.map((f) => f.duration))),
      top_scripts: scripts.slice(0, 3).map((s) => ({
        ms: round(s.duration),
        source: short(s.sourceURL || "") + (s.sourceFunctionName ? " " + s.sourceFunctionName : ""),
        invoker: String(s.invoker || "").slice(0, 60),
      })),
    };
  } else if (supported.includes("longtask")) {
    const tasks = ((await buffered("longtask")) || []).filter((t) => fcp == null || t.startTime >= fcp);
    blocking = {
      source: "longtask",
      frames: tasks.length,
      blocking_ms: round(tasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)),
      longest_ms: round(Math.max(0, ...tasks.map((t) => t.duration))),
    };
  }

  const bytes = (r) => r.transferSize || r.encodedBodySize || 0;
  const byType = {};
  for (const r of resources) {
    const t = (byType[r.initiatorType] ||= { count: 0, transfer_kb: 0 });
    t.count += 1;
    t.transfer_kb += kb(r.transferSize || 0);
  }
  for (const t of Object.values(byType)) t.transfer_kb = Math.round(t.transfer_kb * 10) / 10;
  const files = [...resources]
    .sort((a, b) => bytes(b) - bytes(a))
    .slice(0, 8)
    .map((r) => ({
      file: short(r.name),
      type: r.initiatorType,
      kb: kb(bytes(r)),
      ms: round(r.duration),
      cached: r.transferSize === 0 && r.decodedBodySize > 0,
      blocking: r.renderBlockingStatus === "blocking",
    }));

  return {
    url: location.href,
    env: {
      viewport: innerWidth + "x" + innerHeight,
      dpr: devicePixelRatio,
      mobile_ua: /Mobi|Android/.test(navigator.userAgent),
      network: navigator.connection?.effectiveType ?? null,
      nav_type: nav?.type ?? null,
      document_from_cache: nav ? nav.transferSize === 0 : null,
      settle_ms: SETTLE_MS,
    },
    metrics: {
      ttfb: { ms: round(ttfb), rating: rate(ttfb, 800, 1800) },
      fcp: { ms: round(fcp), rating: rate(fcp, 1800, 3000) },
      lcp: lcp && { ...lcp, rating: rate(lcp.ms, 2500, 4000) },
      cls: shiftEntries
        ? { value: Math.round(cls * 1000) / 1000, rating: rate(cls, 0.1, 0.25), top_shifts: shiftSources }
        : { value: null, rating: null, top_shifts: [] },
      blocking: blocking && { ...blocking, rating: rate(blocking.blocking_ms, 200, 600) },
      dom_content_loaded: round(nav?.domContentLoadedEventEnd),
      load: round(nav?.loadEventEnd),
    },
    resources: {
      count: resources.length,
      transfer_kb: Math.round(resources.reduce((s, r) => s + kb(r.transferSize || 0), 0) * 10) / 10,
      document_kb: nav ? kb(nav.transferSize || nav.encodedBodySize || 0) : null,
      size_hidden: resources.filter((r) => !bytes(r)).length,
      by_type: byType,
      render_blocking: resources.filter((r) => r.renderBlockingStatus === "blocking").map((r) => short(r.name)),
      heaviest: files,
    },
  };
})()
