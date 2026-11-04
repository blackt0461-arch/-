// テスト用：Supabase（ネットの保存先）の呼び出しを、その場で返す。ネットにはつながない
module.exports = async function mock(ctx) {
  const db = { users: {} };
  await ctx.route('**/rest/v1/rpc/**', async route => {
    const name = route.request().url().split('/rpc/')[1];
    const body = JSON.parse(route.request().postData() || '{}');
    const ok = (j) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
    const ng = (m) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: m }) });
    if (name === 'sr_signup' || name === 'sr_login') { const u = db.users[body.p_username] ||= { data: {} }; return ok({ token: 't-' + body.p_username, username: body.p_username, data: u.data, updated_at: new Date().toISOString(), is_admin: body.p_username === 'admin' }); }
    const un = (body.p_token || '').slice(2);
    if (name === 'sr_load') return db.users[un] ? ok({ username: un, data: db.users[un].data }) : ng('bad_token');
    if (name === 'sr_save') { if (db.users[un]) db.users[un].data = body.p_data; return ok({ updated_at: new Date().toISOString() }); }
    if (name === 'sr_friend_list') return ok([]);
    return ok(null);
  });
};
