# Users API refactor: user search

`UsersService.search` mixed query building with paging and was over 100 lines. The filter construction moved to `buildSearchWhere`, which uses one `contains` helper instead of repeating the case-insensitive match object eleven times.

Behaviour is unchanged, including the existing quirk that a single-word `name` replaces any `q` match (a multi-word name uses `AND` of first and last name instead). `search` itself now only paginates and shapes the response.
