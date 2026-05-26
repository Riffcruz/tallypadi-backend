import { performance } from 'perf_hooks';

const targetUrl = process.env.MARKETPLACE_LOAD_URL || 'http://127.0.0.1:5000/api/marketplace?limit=24';
const totalRequests = Math.max(1, Number(process.env.MARKETPLACE_LOAD_REQUESTS || 1000));
const concurrency = Math.max(1, Number(process.env.MARKETPLACE_LOAD_CONCURRENCY || 100));

type Result = {
  ok: boolean;
  status: number;
  ms: number;
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
};

async function hitMarketplace(): Promise<Result> {
  const startedAt = performance.now();
  try {
    const response = await fetch(targetUrl, {
      headers: { accept: 'application/json' },
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      ms: performance.now() - startedAt,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - startedAt,
    };
  }
}

async function main() {
  const results: Result[] = [];
  let issued = 0;

  const worker = async () => {
    while (issued < totalRequests) {
      issued += 1;
      results.push(await hitMarketplace());
    }
  };

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()));
  const durationMs = performance.now() - startedAt;
  const durations = results.map((result) => result.ms);
  const ok = results.filter((result) => result.ok).length;
  const failed = results.length - ok;
  const statusCounts = results.reduce<Record<string, number>>((acc, result) => {
    const key = String(result.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    targetUrl,
    totalRequests: results.length,
    concurrency,
    durationMs: Math.round(durationMs),
    requestsPerSecond: Number((results.length / (durationMs / 1000)).toFixed(2)),
    ok,
    failed,
    statusCounts,
    latencyMs: {
      min: Math.round(Math.min(...durations)),
      p50: Math.round(percentile(durations, 50)),
      p95: Math.round(percentile(durations, 95)),
      p99: Math.round(percentile(durations, 99)),
      max: Math.round(Math.max(...durations)),
    },
  }, null, 2));

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Marketplace load test failed:', error);
  process.exit(1);
});
