# Quick Start Guide

## 5-Minute Integration

### Step 1: Import (30 seconds)

```typescript
import { 
  TimeoutMiddleware, 
  createCircuitBreaker 
} from 'src/middleware/advanced';
```

### Step 2: Configure in AppModule (2 minutes)

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TimeoutMiddleware, createCircuitBreaker } from 'src/middleware/advanced';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply timeout to all routes
    consumer
      .apply(new TimeoutMiddleware({ 
        timeout: 10000, // 10 seconds
        excludePaths: ['/health']
      }))
      .forRoutes('*');

    // Apply circuit breaker to API routes
    const { middleware } = createCircuitBreaker({
      failureThreshold: 5,
      retryInterval: 30000,
    });

    consumer
      .apply(middleware)
      .forRoutes('/api/*');
  }
}
```

### Step 3: Add Health Check (1 minute)

```typescript
import { Controller, Get } from '@nestjs/common';
import { CircuitBreakerService } from 'src/middleware/advanced';

@Controller('health')
export class HealthController {
  constructor(private circuitBreaker: CircuitBreakerService) {}

  @Get('circuit')
  getCircuitHealth() {
    return this.circuitBreaker.getStats();
  }
}
```

### Step 4: Test It (1.5 minutes)

```bash
# Normal request
curl http://localhost:3000/api/test
# Expected: Works normally

# Trigger timeout (simulate slow endpoint)
curl http://localhost:3000/api/slow-endpoint
# Expected: 503 after 10 seconds

# Check circuit state
curl http://localhost:3000/health/circuit
# Expected: { state: 'CLOSED', failureCount: 0, ... }

# Trigger failures to open circuit
# Make 5 failing requests...
# Then check health again
curl http://localhost:3000/health/circuit
# Expected: { state: 'OPEN', failureCount: 5, ... }
```

---

## Common Configurations

### Conservative (Production)

```typescript
// Strict timeouts, sensitive circuit breaker
new TimeoutMiddleware({ timeout: 5000 })
createCircuitBreaker({
  failureThreshold: 3,
  retryInterval: 15000,
  successThreshold: 2,
})
```

### Lenient (Development)

```typescript
// Relaxed timeouts, tolerant circuit breaker
new TimeoutMiddleware({ timeout: 30000 })
createCircuitBreaker({
  failureThreshold: 10,
  retryInterval: 60000,
  successThreshold: 5,
})
```

### Balanced (Recommended Default)

```typescript
// Good balance of protection and tolerance
new TimeoutMiddleware({ timeout: 10000 })
createCircuitBreaker({
  failureThreshold: 5,
  retryInterval: 30000,
  successThreshold: 3,
})
```

---

## Troubleshooting

### Problem: Circuit opens too frequently

**Solution**: Increase failure threshold or timeout
```typescript
createCircuitBreaker({
  failureThreshold: 10, // Was 5
  retryInterval: 60000, // Was 30000
})
```

### Problem: Requests timing out unexpectedly

**Solution**: Increase timeout or check downstream services
```typescript
new TimeoutMiddleware({ 
  timeout: 30000 // Was 10000
})
```

### Problem: Need to reset circuit manually

**Solution**: Use reset method
```typescript
@Post('admin/reset-circuit')
resetCircuit() {
  this.circuitBreaker.reset();
  return { status: 'reset' };
}
```

---

## Monitoring Checklist

Set up alerts for:
- [ ] Circuit opens > 3 times per hour
- [ ] Circuit stays OPEN > 5 minutes
- [ ] Timeout rate > 10% of requests
- [ ] Failure rate approaching threshold (>80%)

Monitor these metrics:
- [ ] Current circuit state
- [ ] Failure count trend
- [ ] Average response time
- [ ] Timeout frequency

---

## Next Steps

After basic integration:

1. **Review Documentation**
   - Read `README.md` for detailed usage
   - Check `ARCHITECTURE.md` for flow diagrams
   - See `IMPLEMENTATION_SUMMARY.md` for technical details

2. **Customize Configuration**
   - Adjust timeouts based on your SLAs
   - Tune failure thresholds based on traffic patterns
   - Set up path exclusions for internal endpoints

3. **Set Up Monitoring**
   - Add health check endpoint
   - Integrate with monitoring system
   - Create dashboards and alerts

4. **Test Under Load**
   - Run load tests to validate configuration
   - Verify circuit breaker behavior under failures
   - Check timeout handling

5. **Deploy to Staging**
   - Monitor circuit state transitions
   - Collect baseline metrics
   - Adjust configuration if needed

6. **Production Rollout**
   - Start with conservative settings
   - Monitor closely during first week
   - Document any incidents and adjustments

---

## Support Resources

| Resource | What You'll Find |
|----------|------------------|
| `README.md` | Complete usage guide, examples, troubleshooting |
| `ARCHITECTURE.md` | Flow diagrams, state machine visuals |
| `IMPLEMENTATION_SUMMARY.md` | Technical implementation details |
| `CHECKLIST.md` | Requirements verification |
| `usage-examples.ts` | Code examples for common scenarios |
| Test files | Usage patterns and edge cases |

---

## FAQ

**Q: Can I use both middlewares together?**  
A: Yes! They're designed to work together. Timeout protects individual requests, circuit breaker protects the overall system.

**Q: Do I need external libraries?**  
A: No! This is a pure TypeScript implementation with zero external dependencies beyond NestJS/Express.

**Q: Will this work with microservices?**  
A: Yes, but each service instance tracks its own state. For shared state across instances, consider adding Redis persistence (future enhancement).

**Q: How do I know what timeout value to use?**  
A: Start with 10 seconds for user-facing APIs, 30 seconds for background jobs. Adjust based on your p95/p99 latency percentiles.

**Q: What happens when the circuit opens?**  
A: All requests are immediately rejected with 503. No calls are made to the external service until the circuit recovers.

**Q: How does the circuit recover?**  
A: After the retry interval (default 30s), it transitions to HALF_OPEN and allows test requests. If they succeed, it closes.

**Q: Can I disable the middleware in development?**  
A: Yes! Use conditional configuration based on NODE_ENV:
```typescript
if (process.env.NODE_ENV === 'production') {
  consumer.apply(middleware).forRoutes('/api/*');
}
```

---

## TL;DR

```typescript
// Import
import { TimeoutMiddleware, createCircuitBreaker } from 'src/middleware/advanced';

// Configure
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(new TimeoutMiddleware({ timeout: 10000 })).forRoutes('*');
    
    const { middleware } = createCircuitBreaker({
      failureThreshold: 5,
      retryInterval: 30000,
    });
    consumer.apply(middleware).forRoutes('/api/*');
  }
}

// Monitor
@Get('health/circuit')
getCircuitHealth() {
  return this.circuitBreaker.getStats();
}
```

That's it! You're now protected against slow and failing external services. 🎉
