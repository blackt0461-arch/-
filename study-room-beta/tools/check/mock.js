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
    if (name === 'sr_admin_grant_code') { if (!db.users[body.p_username]) return ng('not_found'); (db.users[body.p_username].codes ||= []).push(body.p_code); return ok({ ok: true }); }
    if (name === 'sr_my_codes') return ok(db.users[un]?.codes || []);
    if (name === 'sr_admin_users') return ok(Object.keys(db.users).map(n => { const pf = db.users[n].data?.profile || {}; return { username: n, created_at: new Date().toISOString(), summary: { xp: pf.xp, solved: pf.solved, correct: pf.correct, mode: pf.mode, avatar: pf.avatar, avatarColor: pf.avatarColor, title: pf.title }, units: {} }; }));
    if (name === 'sr_admin_delete_user') { if (body.p_username === 'admin') return ng('cannot_delete_admin'); if (!db.users[body.p_username]) return ng('not_found'); delete db.users[body.p_username]; return ok({ deleted: body.p_username }); }
    if (name === 'sr_gift_list') return ok([{ id: 1, title: 'いつもありがとう', kind: 'ticket', amount: 3, item_id: null, created_at: new Date().toISOString() }]);
    if (name === 'sr_profile') { const d = db.users[body.p_username]?.data; if (!d) return ng('not_found'); const pf = d.profile || {}; return ok({ username: body.p_username, profile: pf, units: Object.fromEntries(Object.entries(d.subjects || {}).map(([k, v]) => [k, v.units || {}])), streak: d.streak, collected: Object.keys(d.house?.collected || {}), admin: body.p_username === 'admin' }); }
    if (name === 'sr_weekly_ranking' || name === 'sr_weekly_puzzle') { const top = Object.entries(db.users).filter(([n, u]) => u.data?.profile).map(([n, u], i) => ({ pos: i + 1, username: n, solved: u.data.profile.solved || 0, correct: u.data.profile.correct || 0, me: 't-' + n === body.p_token, avatar: u.data.profile.avatar, avatarColor: u.data.profile.avatarColor, title: u.data.profile.title })); return ok({ top, me: null, total: top.length }); }
    return ok(null);
  });
};
