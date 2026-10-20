import { ValidationPipe } from '@nestjs/common';
import { UpdateSessionDto } from './session.dto';

describe('UpdateSessionDto sanitization', () => {
  // Mirrors the pipe configured in main.ts (whitelist + transform) so the
  // @Transform callback is exercised the same way it is in production.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const transform = (value: unknown): Promise<UpdateSessionDto> =>
    pipe.transform(value, { type: 'body', metatype: UpdateSessionDto });

  it('trims, strips HTML and collapses whitespace in the display name', async () => {
    const dto = await transform({ displayName: '  <i>Work</i>   laptop  ' });

    expect(dto.displayName).toBe('Work laptop');
  });

  it('strips control characters from the display name', async () => {
    const dto = await transform({ displayName: 'Work\u0000laptop' });

    expect(dto.displayName).toBe('Worklaptop');
  });

  it('leaves an absent display name undefined', async () => {
    const dto = await transform({});

    expect(dto.displayName).toBeUndefined();
  });
});
