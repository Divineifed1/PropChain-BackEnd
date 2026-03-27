import { Test, TestingModule } from '@nestjs/testing';
import { PuzzlesService } from './puzzles.service';
import { PuzzlesRepository } from './puzzles.repository';

describe('Cursor Pagination', () => {
  let service: PuzzlesService;

  const mockRepo = {
    findWithCursor: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzlesService,
        {
          provide: PuzzlesRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<PuzzlesService>(PuzzlesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return first page with nextCursor', async () => {
    mockRepo.findWithCursor.mockResolvedValue({
      data: Array.from({ length: 5 }).map((_, i) => ({
        id: i + 1,
        createdAt: new Date(Date.now() - i * 1000),
      })),
      hasNextPage: true,
      nextCursor: 'cursor_1',
    });

    const result = await service.getPaginatedPuzzles({ limit: 5 });

    expect(result.data.length).toBe(5);
    expect(result.hasNextPage).toBe(true);
    expect(result.nextCursor).toBeDefined();
  });

  it('should return next page using cursor', async () => {
    const firstPage = {
      data: [
        { createdAt: new Date('2024-01-01T10:00:00Z') },
        { createdAt: new Date('2024-01-01T09:00:00Z') },
      ],
      hasNextPage: true,
      nextCursor: 'cursor_1',
    };

    const secondPage = {
      data: [
        { createdAt: new Date('2024-01-01T08:00:00Z') },
      ],
      hasNextPage: false,
      nextCursor: undefined,
    };

    mockRepo.findWithCursor
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    const first = await service.getPaginatedPuzzles({ limit: 5 });
    const second = await service.getPaginatedPuzzles({
      limit: 5,
      cursor: first.nextCursor,
    });

    expect(
      second.data[0].createdAt.getTime(),
    ).toBeLessThan(
      first.data[first.data.length - 1].createdAt.getTime(),
    );
  });

  it('should handle end of dataset gracefully', async () => {
    mockRepo.findWithCursor.mockResolvedValue({
      data: Array.from({ length: 3 }).map(() => ({
        id: Math.random(),
      })),
      hasNextPage: false,
      nextCursor: undefined,
    });

    const result = await service.getPaginatedPuzzles({ limit: 1000 });

    expect(result.hasNextPage).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });
});