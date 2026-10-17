import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus metrics for the Auth API. Labels are bounded: `operation` is a
 * controller handler name and `outcome` is one of three values, so cardinality
 * cannot grow with user input. Metrics are looked up before being created so
 * hot reloads and test suites do not register them twice.
 */
export type AuthOutcome = 'success' | 'client_error' | 'server_error';

export const authRequestsTotal: Counter<'operation' | 'outcome'> =
  (register.getSingleMetric('auth_requests_total') as Counter<'operation' | 'outcome'>) ??
  new Counter({
    name: 'auth_requests_total',
    help: 'Auth API requests by handler and outcome',
    labelNames: ['operation', 'outcome'],
  });

export const authRequestDurationSeconds: Histogram<'operation'> =
  (register.getSingleMetric('auth_request_duration_seconds') as Histogram<'operation'>) ??
  new Histogram({
    name: 'auth_request_duration_seconds',
    help: 'Auth API handler latency in seconds',
    labelNames: ['operation'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

export function outcomeForStatus(status: number): AuthOutcome {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}
