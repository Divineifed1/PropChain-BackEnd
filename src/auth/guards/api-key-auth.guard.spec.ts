import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { AuthService } from '../auth.service';

function makeContext(headers: Record<string, string | string[]>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: jest.fn() }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ApiKeyAuthGuard - transport styles (#1193)', () => {
  let guard: ApiKeyAuthGuard;
  let authService: { validateApiKey: jest.Mock };

  beforeEach(() => {
    authService = {
      validateApiKey: jest.fn().mockResolvedValue({ sub: 'user-1', type: 'api-key' }),
    };
    guard = new ApiKeyAuthGuard(authService as unknown as AuthService);
  });

  it('accepts the documented api-key header', async () => {
    const ctx = makeContext({ 'api-key': 'key-abc' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('key-abc');
  });

  it('accepts the legacy x-api-key header', async () => {
    const ctx = makeContext({ 'x-api-key': 'key-xyz' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('key-xyz');
  });

  it('accepts Authorization: ApiKey <key>', async () => {
    const ctx = makeContext({ authorization: 'ApiKey key-auth' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('key-auth');
  });

  it('prefers api-key when both headers are present', async () => {
    const ctx = makeContext({ 'api-key': 'key-primary', 'x-api-key': 'key-legacy' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('key-primary');
  });

  it('throws 401 when no transport style is present', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(authService.validateApiKey).not.toHaveBeenCalled();
  });

  it('throws 401 when Authorization uses an unsupported scheme', async () => {
    const ctx = makeContext({ authorization: 'Bearer token-not-api-key' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(authService.validateApiKey).not.toHaveBeenCalled();
  });
});
