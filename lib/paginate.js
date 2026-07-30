/**
 * Fetches every row from a Supabase table in 1000-row pages, working around the
 * PostgREST row cap. Pass a filter callback to narrow the query, e.g.
 *   fetchAllRows(supabase, 'results', { filter: q => q.eq('swimmer_id', id) })
 *
 * Orders by `id` so .range() page boundaries are stable — without an explicit
 * order, Postgres can return rows in a different sequence per page request,
 * silently duplicating or dropping rows across pages under concurrent load.
 *
 * @param {object} client   A Supabase client (browser anon or service role).
 * @param {string} table    Table name.
 * @param {object} [opts]
 * @param {string} [opts.select='*']   Columns / embed string.
 * @param {function} [opts.filter]     q => q  transform applied to each page query.
 * @param {number} [opts.pageSize=1000]
 * @param {number} [opts.maxPages=100] Safety cap on total pages.
 * @returns {Promise<Array>} All rows.
 * @throws {Error} if any page query fails — a partial array is indistinguishable
 *         from a complete one at the call site, and silently returning one is
 *         how truncated data reaches the UI as if it were the whole dataset.
 */
export async function fetchAllRows(client, table, { select = '*', filter = null, pageSize = 1000, maxPages = 100 } = {}) {
  if (!client) return [];
  let all = [];
  let page = 0;
  while (page < maxPages) {
    // The caller's filter is applied BEFORE .order()/.range() so that a filter
    // supplying its own .order() becomes the primary sort key; `id` is then
    // appended only as the tiebreaker that keeps page boundaries stable.
    let q = client.from(table).select(select);
    if (filter) q = filter(q);
    q = q.order('id').range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, error } = await q;
    if (error) {
      throw new Error(`fetchAllRows(${table}) failed on page ${page}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}
