# Load Testing Guide

This repository now includes a dedicated load testing suite to satisfy #140.

## Tools
- k6 (https://k6.io)

## Location
- `loadtests/propchain-loadtest.js`

## Running locally
1. Install dependencies:
   ```bash
   npm ci
   npm install --save-dev k6
   ```
2. Set env vars:
   ```bash
   export API_URL=http://localhost:3000
   export TEST_USER_EMAIL=loadtest@propchain.local
   export TEST_USER_PASSWORD=Password123!
   ```
3. Start the backend in a separate terminal:
   ```bash
   npm run start
   ```
4. Run load test:
   ```bash
   npm run loadtest
   ```

## CI integration
- Workflow: `.github/workflows/ci.yml`
- Job: `load-test`
- Command: `npm run loadtest:ci`
- Results are saved as artifact `k6-results` in JSON format.

## Performance criteria
- http_req_failed: < 1%
- 95th percentile response time: < 600ms

## To add scenarios
- Edit `loadtests/propchain-loadtest.js` with more groups/endpoints.
- Add custom thresholds for endpoint-level behavior.
