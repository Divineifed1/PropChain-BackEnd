import { Histogram } from 'prom-client';

export const paginationLatency = new Histogram({
  name: 'pagination_query_duration_seconds',
  help: 'Duration of pagination queries',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
});
