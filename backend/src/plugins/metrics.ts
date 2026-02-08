/**
 * Metrics Plugin
 *
 * In-memory counters and histograms collected via Fastify hooks.
 * Exposes GET /metrics (Prometheus text format) and GET /metrics/json.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface Histogram {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class MetricsCollector {
  private counters = new Map<string, Map<string, number>>();
  private histograms = new Map<string, Map<string, Histogram>>();

  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }
    const key = this.labelsToKey(labels);
    const counter = this.counters.get(name)!;
    counter.set(key, (counter.get(key) || 0) + 1);
  }

  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
    }
    const key = this.labelsToKey(labels);
    const histMap = this.histograms.get(name)!;

    if (!histMap.has(key)) {
      const buckets = new Map<number, number>();
      DEFAULT_BUCKETS.forEach((b) => buckets.set(b, 0));
      histMap.set(key, { count: 0, sum: 0, buckets });
    }

    const hist = histMap.get(key)!;
    hist.count++;
    hist.sum += value;

    for (const [bucket] of hist.buckets) {
      if (value <= bucket) {
        hist.buckets.set(bucket, hist.buckets.get(bucket)! + 1);
      }
    }
  }

  toPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, counterMap] of this.counters) {
      lines.push(`# HELP ${name} Counter metric`);
      lines.push(`# TYPE ${name} counter`);
      for (const [labelKey, value] of counterMap) {
        const labelStr = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}${labelStr} ${value}`);
      }
    }

    // Histograms
    for (const [name, histMap] of this.histograms) {
      lines.push(`# HELP ${name} Histogram metric`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [labelKey, hist] of histMap) {
        const baseLabels = labelKey ? `${labelKey},` : '';
        for (const [bucket, count] of hist.buckets) {
          lines.push(`${name}_bucket{${baseLabels}le="${bucket}"} ${count}`);
        }
        lines.push(`${name}_bucket{${baseLabels}le="+Inf"} ${hist.count}`);
        lines.push(`${name}_sum{${labelKey ? labelKey : ''}} ${hist.sum}`);
        lines.push(`${name}_count{${labelKey ? labelKey : ''}} ${hist.count}`);
      }
    }

    // Node.js heap
    const mem = process.memoryUsage();
    lines.push('# HELP nodejs_heap_bytes Node.js heap usage in bytes');
    lines.push('# TYPE nodejs_heap_bytes gauge');
    lines.push(`nodejs_heap_bytes{type="used"} ${mem.heapUsed}`);
    lines.push(`nodejs_heap_bytes{type="total"} ${mem.heapTotal}`);
    lines.push(`nodejs_heap_bytes{type="rss"} ${mem.rss}`);

    return lines.join('\n') + '\n';
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Counters
    for (const [name, counterMap] of this.counters) {
      const values: Record<string, number> = {};
      for (const [labelKey, value] of counterMap) {
        values[labelKey || '_total'] = value;
      }
      result[name] = values;
    }

    // Histograms
    for (const [name, histMap] of this.histograms) {
      const values: Record<string, { count: number; sum: number }> = {};
      for (const [labelKey, hist] of histMap) {
        values[labelKey || '_total'] = { count: hist.count, sum: hist.sum };
      }
      result[name] = values;
    }

    // Memory
    const mem = process.memoryUsage();
    result.nodejs_heap_bytes = {
      used: mem.heapUsed,
      total: mem.heapTotal,
      rss: mem.rss,
    };

    return result;
  }

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

export const metrics = new MetricsCollector();

export async function metricsPlugin(fastify: FastifyInstance) {
  // Collect request metrics
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method;
    const route = request.routeOptions?.url || request.url;
    const statusCode = String(reply.statusCode);
    const durationSeconds = ((reply as any).getResponseTime?.() ?? 0) / 1000;

    metrics.incrementCounter('http_requests_total', { method, route, status: statusCode });
    metrics.observeHistogram('http_request_duration_seconds', durationSeconds, { method, route });

    if (reply.statusCode >= 400) {
      metrics.incrementCounter('http_request_errors_total', { method, route, status: statusCode });
    }
  });

  // Prometheus text format
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(metrics.toPrometheus());
  });

  // JSON format
  fastify.get('/metrics/json', async (_request, reply) => {
    return reply.send(metrics.toJSON());
  });
}
