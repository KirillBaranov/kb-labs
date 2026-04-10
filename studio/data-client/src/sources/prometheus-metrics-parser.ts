import type { PrometheusMetrics } from '../contracts/observability';

type Sample = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

type HistogramPoint = {
  le: number;
  count: number;
};

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }

  const labels: Record<string, string> = {};
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\"|[^"])*)"/g;

  for (const match of raw.matchAll(pattern)) {
    const key = match[1];
    if (!key) {
      continue;
    }

    labels[key] = (match[2] ?? '').replace(/\\"/g, '"');
  }

  return labels;
}

function parseSamples(text: string): Sample[] {
  const samples: Sample[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
    if (!match) {
      continue;
    }

    samples.push({
      name: match[1]!,
      labels: parseLabels(match[2]),
      value: Number(match[3]),
    });
  }

  return samples;
}

function sumMetric(samples: Sample[], metricName: string): number {
  return samples
    .filter((sample) => sample.name === metricName)
    .reduce((sum, sample) => sum + sample.value, 0);
}

function latestMetric(samples: Sample[], metricName: string): number | null {
  const metric = [...samples].reverse().find((sample: Sample) => sample.name === metricName);
  return metric ? metric.value : null;
}

function buildHistogram(samples: Sample[], bucketMetric: string): HistogramPoint[] {
  return samples
    .filter((sample) => sample.name === bucketMetric && sample.labels.le)
    .map((sample) => ({
      le: sample.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(sample.labels.le),
      count: sample.value,
    }))
    .sort((a, b) => a.le - b.le);
}

function interpolateQuantile(quantile: number, histogram: HistogramPoint[]): number {
  if (histogram.length === 0) {
    return 0;
  }

  const total = histogram.find((point) => !Number.isFinite(point.le))?.count ?? histogram[histogram.length - 1]!.count;
  if (total <= 0) {
    return 0;
  }

  const target = total * quantile;
  let previousCount = 0;
  let previousLe = 0;

  for (const point of histogram) {
    if (point.count >= target) {
      if (!Number.isFinite(point.le)) {
        return previousLe;
      }

      const bucketCount = point.count - previousCount;
      if (bucketCount <= 0) {
        return point.le;
      }

      const progress = (target - previousCount) / bucketCount;
      return previousLe + (point.le - previousLe) * progress;
    }

    previousCount = point.count;
    if (Number.isFinite(point.le)) {
      previousLe = point.le;
    }
  }

  return previousLe;
}

function buildLatency(samples: Sample[]) {
  const count = sumMetric(samples, 'http_request_duration_ms_count');
  const total = sumMetric(samples, 'http_request_duration_ms_sum');
  const histogram = buildHistogram(samples, 'http_request_duration_ms_bucket');
  const finiteBuckets = histogram.filter((point) => Number.isFinite(point.le) && point.count > 0);

  return {
    average: count > 0 ? total / count : 0,
    min: finiteBuckets[0]?.le ?? 0,
    max: finiteBuckets[finiteBuckets.length - 1]?.le ?? 0,
    p50: interpolateQuantile(0.5, histogram),
    p95: interpolateQuantile(0.95, histogram),
    p99: interpolateQuantile(0.99, histogram),
  };
}

function groupByLabel(samples: Sample[], metricName: string, label: string): Map<string, Sample[]> {
  const grouped = new Map<string, Sample[]>();

  for (const sample of samples) {
    if (sample.name !== metricName || !sample.labels[label]) {
      continue;
    }

    const key = sample.labels[label]!;
    const existing = grouped.get(key) ?? [];
    existing.push(sample);
    grouped.set(key, existing);
  }

  return grouped;
}

function buildPluginMetrics(samples: Sample[]): PrometheusMetrics['perPlugin'] {
  const groupedCounts = groupByLabel(samples, 'kb_plugin_request_total', 'plugin');
  const durationSums = groupByLabel(samples, 'kb_plugin_request_duration_ms_sum', 'plugin');
  const durationCounts = groupByLabel(samples, 'kb_plugin_request_duration_ms_count', 'plugin');

  return Array.from(new Set([
    ...groupedCounts.keys(),
    ...durationSums.keys(),
    ...durationCounts.keys(),
  ])).map((pluginId) => {
    const requests = (groupedCounts.get(pluginId) ?? []).reduce((sum, sample) => sum + sample.value, 0);
    const errors = (groupedCounts.get(pluginId) ?? [])
      .filter((sample) => Number(sample.labels.status_code ?? 0) >= 400)
      .reduce((sum, sample) => sum + sample.value, 0);
    const totalDuration = (durationSums.get(pluginId) ?? []).reduce((sum, sample) => sum + sample.value, 0);
    const durationCount = (durationCounts.get(pluginId) ?? []).reduce((sum, sample) => sum + sample.value, 0);

    return {
      pluginId,
      requests,
      errors,
      latency: {
        average: durationCount > 0 ? totalDuration / durationCount : 0,
        min: 0,
        max: 0,
      },
    };
  });
}

function buildTenantMetrics(samples: Sample[]): PrometheusMetrics['perTenant'] {
  const groupedCounts = groupByLabel(samples, 'kb_tenant_request_total', 'tenant');
  const errorCounts = groupByLabel(samples, 'kb_tenant_request_errors_total', 'tenant');
  const durationSums = groupByLabel(samples, 'kb_tenant_request_duration_ms_sum', 'tenant');
  const durationCounts = groupByLabel(samples, 'kb_tenant_request_duration_ms_count', 'tenant');

  return Array.from(new Set([
    ...groupedCounts.keys(),
    ...errorCounts.keys(),
    ...durationSums.keys(),
    ...durationCounts.keys(),
  ])).map((tenantId) => {
    const requests = (groupedCounts.get(tenantId) ?? []).reduce((sum, sample) => sum + sample.value, 0);
    const errors = (errorCounts.get(tenantId) ?? []).reduce((sum, sample) => sum + sample.value, 0);
    const totalDuration = (durationSums.get(tenantId) ?? []).reduce((sum, sample) => sum + sample.value, 0);
    const durationCount = (durationCounts.get(tenantId) ?? []).reduce((sum, sample) => sum + sample.value, 0);

    return {
      tenantId,
      requests,
      errors,
      latency: {
        average: durationCount > 0 ? totalDuration / durationCount : 0,
      },
    };
  });
}

function buildErrorBreakdown(samples: Sample[]): PrometheusMetrics['errors'] {
  const byStatusCode: Record<number, number> = {};

  for (const sample of samples) {
    if (sample.name !== 'http_requests_total') {
      continue;
    }

    const statusCode = Number(sample.labels.status_code ?? 0);
    if (statusCode < 400) {
      continue;
    }

    byStatusCode[statusCode] = (byStatusCode[statusCode] ?? 0) + sample.value;
  }

  return {
    byStatusCode,
    recent: [],
  };
}

export function parsePrometheusMetrics(text: string): PrometheusMetrics {
  const samples = parseSamples(text);
  const totalRequests = sumMetric(samples, 'http_requests_total');
  const errors = buildErrorBreakdown(samples);
  const clientErrors = Object.entries(errors.byStatusCode)
    .filter(([code]) => Number(code) >= 400 && Number(code) < 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const serverErrors = Object.entries(errors.byStatusCode)
    .filter(([code]) => Number(code) >= 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const pluginMountTotal = latestMetric(samples, 'kb_plugins_mount_total');
  const pluginMountSucceeded = latestMetric(samples, 'kb_plugins_mount_succeeded');
  const pluginMountFailed = latestMetric(samples, 'kb_plugins_mount_failed');
  const pluginMountElapsedMs = latestMetric(samples, 'kb_plugins_mount_elapsed_ms');
  const uptimeSeconds = latestMetric(samples, 'process_uptime_seconds') ?? 0;
  const redisHealthy = latestMetric(samples, 'kb_redis_healthy');
  const redisTransitions = groupByLabel(samples, 'kb_redis_status_transitions_total', 'state');

  return {
    requests: {
      total: totalRequests,
      success: Math.max(0, totalRequests - clientErrors - serverErrors),
      clientErrors,
      serverErrors,
    },
    latency: buildLatency(samples),
    perPlugin: buildPluginMetrics(samples),
    perTenant: buildTenantMetrics(samples),
    errors,
    timestamps: {
      startTime: Date.now() - uptimeSeconds * 1000,
      lastRequest: null,
    },
    redis: {
      updates: sumMetric(samples, 'kb_redis_status_updates_total'),
      healthyTransitions: (redisTransitions.get('healthy') ?? []).reduce((sum, sample) => sum + sample.value, 0),
      unhealthyTransitions: (redisTransitions.get('unhealthy') ?? []).reduce((sum, sample) => sum + sample.value, 0),
      lastStatus: redisHealthy === null
        ? null
        : {
            healthy: redisHealthy >= 1,
            state: redisHealthy >= 1 ? 'healthy' : 'unhealthy',
            role: 'unknown',
          },
    },
    pluginMounts: pluginMountTotal === null
      ? null
      : {
          total: pluginMountTotal,
          succeeded: pluginMountSucceeded ?? 0,
          failed: pluginMountFailed ?? 0,
          elapsedMs: pluginMountElapsedMs ?? 0,
        },
    uptime: {
      seconds: uptimeSeconds,
      startTime: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
      lastRequest: null,
    },
  };
}
