async findWithCursor(
  params: CursorPaginationDto,
): Promise<CursorPaginationResponse<PuzzleEntity>> {
  const limit = params.limit ?? 20;

  const qb = this.repo
    .createQueryBuilder('puzzle')
    .orderBy('puzzle.createdAt', 'DESC')
    .take(limit + 1);

  /**
   * Cursor decoding (safe guard added)
   */
  if (params.cursor) {
    let decodedCursor: string;

    try {
      decodedCursor = Buffer.from(params.cursor, 'base64').toString('utf-8');
    } catch {
      throw new Error('Invalid cursor');
    }

    const cursorDate = new Date(decodedCursor);

    if (isNaN(cursorDate.getTime())) {
      throw new Error('Invalid cursor date');
    }

    qb.where('puzzle.createdAt < :cursor', { cursor: cursorDate });
  }

  const results = await qb.getMany();

  const hasNextPage = results.length > limit;
  const data = hasNextPage ? results.slice(0, limit) : results;

  /**
   * Safe cursor generation
   */
  const nextCursor =
    hasNextPage && data.length > 0
      ? Buffer.from(
          data[data.length - 1].createdAt.toISOString(),
        ).toString('base64')
      : undefined;

  return {
    data,
    nextCursor,
    hasNextPage,
  };
}