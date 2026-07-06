/**
 * Fetches every row from a Supabase table in 1000-row pages, working around the
 * PostgREST row cap. Pass a filter callback to narrow the query, e.g.
 *   fetchAllRows(supabase, 'results', { filter: q => q.eq('swimmer_id', id) })
 *
 * @param {object} client   A Supabase client (browser anon or service role).
 * @param {string} table    Table name.
 * @param {object} [opts]
 * @param {string} [opts.select='*']   Columns / embed string.
 * @param {function} [opts.filter]     q => q  transform applied to each page query.
 * @param {number} [opts.pageSize=1000]
 * @param {number} [opts.maxPages=100] Safety cap on total pages.
 * @returns {Promise<Array>} All rows (empty array on missing client or error).
 */
export async function fetchAllRows(client, table, { select = '*', filter = null, pageSize = 1000, maxPages = 100 } = {}) {
  if (!client) return [];
  let all = [];
  let page = 0;
  while (page < maxPages) {
    let q = client.from(table).select(select).range(page * pageSize, (page + 1) * pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}
