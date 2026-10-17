import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus metrics for the Users API. Labels are bounded: `operation` is a
 * controller handler name and `outcome` one of three values, so cardinality
 * cannot grow with user input. Metrics are looked up before being created so hot
 * reloads and test suites do not register them twice.
 */
export type UsersOutcome = 'success' | 'client_error' | 'server_error';

export const usersRequestsTotal: Counter<'operation' | 'outcome'> =
  (register.getSingleMetric('users_requests_total') as Counter<'operation' | 'outcome'>) ??
  new Counter({
    name: 'users_requests_total',
    help: 'Users API requests by handler and outcome',
    labelNames: ['operation', 'outcome'],
  });

export const usersRequestDurationSeconds: Histogram<'operation'> =
  (register.getSingleMetric('users_request_duration_seconds') as Histogram<'operation'>) ??
  new Histogram({
    name: 'users_request_duration_seconds',
    help: 'Users API handler latency in seconds',
    labelNames: ['operation'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

export function usersOutcomeForStatus(status: number): UsersOutcome {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}
