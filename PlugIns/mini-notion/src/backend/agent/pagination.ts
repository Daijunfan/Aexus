/** Consume the native cursor without changing the underlying paginated control API. */
export async function allPages<T>(
  read: (cursor?: string) => Promise<{ data: T[]; nextCursor?: string | null }>,
) {
  const data: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    data.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return { data, nextCursor: null };
}
