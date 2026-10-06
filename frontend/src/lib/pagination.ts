export const DEFAULT_PAGE_SIZE = 50;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/** Build a list path with page/limit and optional extra filters. */
export function listQuery(
  basePath: string,
  opts: {
    page?: number;
    limit?: number;
    params?: Record<string, string | number | undefined | null>;
  } = {}
): string {
  const params = new URLSearchParams();
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_PAGE_SIZE;
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (opts.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function paginationFrom(data: Partial<PaginationMeta> | null | undefined): PaginationMeta {
  const page = data?.page && data.page > 0 ? data.page : 1;
  const limit = data?.limit && data.limit > 0 ? data.limit : DEFAULT_PAGE_SIZE;
  const total = typeof data?.total === "number" ? data.total : 0;
  const totalPages =
    typeof data?.totalPages === "number" && data.totalPages > 0
      ? data.totalPages
      : Math.max(1, Math.ceil(total / limit) || 1);
  return { page, limit, total, totalPages };
}
