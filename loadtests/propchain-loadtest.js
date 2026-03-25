import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.LOAD_VUS || 40),
  duration: __ENV.LOAD_DURATION || '3m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const TEST_EMAIL = __ENV.TEST_USER_EMAIL || 'loadtest@propchain.local';
const TEST_PASSWORD = __ENV.TEST_USER_PASSWORD || 'Password123!';

function login() {
  const payload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  const headers = {
    'Content-Type': 'application/json',
  };

  const res = http.post(`${API_URL}/auth/login`, payload, { headers });

  check(res, {
    'login status is 200': (r) => r.status === 200,
    'login returns access token': (r) => r.json('accessToken') !== undefined,
  });

  return res.json('accessToken');
}

export default () => {
  group('Auth + Basic API traffic', () => {
    const token = login();
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const props = http.get(`${API_URL}/properties`, { headers: authHeaders });
    check(props, {
      'properties status is 200': (r) => r.status === 200,
    });

    const docs = http.get(`${API_URL}/documents`, { headers: authHeaders });
    check(docs, {
      'documents status is 200': (r) => r.status === 200,
    });

    const health = http.get(`${API_URL}/health`);
    check(health, {
      'health status is 200': (r) => r.status === 200,
    });

    sleep(1);
  });
};
