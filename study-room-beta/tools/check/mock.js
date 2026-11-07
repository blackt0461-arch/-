// テスト用：Supabase（ネットの保存先）の呼び出しを、その場で返す。ネットにはつながない
// db をわたすと、いくつかのブラウザ（端末）で同じ保存先を使える。opts.loadDelay で記録の読みこみをわざと遅くできる
module.exports = async function mock(ctx, db = { users: {} }, opts = {}) {
  await ctx.route('**/rest/v1/rpc/**', async route => {
    const name = route.request().url().split('/rpc/')[1];
    const body = JSON.parse(route.request().postData() || '{}');
    const ok = (j) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
    const ng = (m) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: m }) });
    if (name === 'sr_signup' || name === 'sr_login') { const u = db.users[body.p_username] ||= { data: {} }; return ok({ token: 't-' + body.p_username, username: body.p_username, data: u.data, updated_at: new Date().toISOString(), is_admin: body.p_username === 'admin' }); }
    const un = (body.p_token || '').slice(2);
    if (name === 'sr_load' && opts.loadDelay) await new Promise(r => setTimeout(r, opts.loadDelay));
    if (name === 'sr_load') return db.users[un] ? ok({ username: un, data: db.users[un].data }) : ng('bad_token');
    if (name === 'sr_save') {
      const u = db.users[un];
      if (u && (u.data?.restoredAt || 0) > (body.p_data?.restoredAt || 0)) return ng('restored');
      if (u && u.data?.profile?.sideAt > (body.p_data?.profile?.sideAt || 0)) { body.p_data.profile = { ...body.p_data.profile, side: u.data.profile.side, sideAt: u.data.profile.sideAt }; }
      if (u) { if (u.data?.version) ((db.backups ||= {})[un] ||= []).unshift({ id: (db.bid = (db.bid || 0) + 1), created_at: new Date().toISOString(), data: u.data }); u.data = body.p_data; }
      return ok({ updated_at: new Date().toISOString() });
    }
    if (name === 'sr_admin_backups') return ok(((db.backups || {})[body.p_username] || []).map(b => ({ id: b.id, created_at: b.created_at, xp: b.data.profile?.xp || 0, solved: b.data.profile?.solved || 0, puzzle: b.data.profile?.puzzleClears || 0 })));
    if (name === 'sr_admin_restore') { const u = db.users[body.p_username], b = ((db.backups || {})[body.p_username] || []).find(x => x.id === body.p_backup); if (!u || !b) return ng('not_found'); const t = Date.now(); db.backups[body.p_username].unshift({ id: (db.bid += 1), created_at: new Date().toISOString(), data: u.data }); u.data = { ...b.data, restoredAt: t, savedAt: t }; return ok({ restored_at: t }); }
    if (name === 'sr_friend_list') return ok([]);
    // ストアに出すための土台（1.12.0）
    if (name === 'sr_delete_me') { if (!db.users[un]) return ng('bad_token'); if (un === 'admin') return ng('cannot_delete_admin'); if (body.p_password !== 'test1234') return ng('bad_login'); delete db.users[un]; return ok({ deleted: un }); }
    if (name === 'sr_recovery_make') { const code = 'ABCD-EFGH-JKLM'; if (db.users[un]) db.users[un].recovery = code.replace(/-/g, ''); return ok({ code }); }
    if (name === 'sr_recovery_status') return ok({ has: !!db.users[un]?.recovery });
    if (name === 'sr_password_reset') { const u = db.users[body.p_username]; if (!u || !u.recovery || u.recovery !== String(body.p_code).toUpperCase().replace(/[^A-Z0-9]/g, '')) return ng('bad_code'); u.recovery = null; u.pw = body.p_new; return ok({ ok: true, username: body.p_username }); }
    if (name === 'sr_block') { ((db.blocks ||= {})[un] ||= []).push(body.p_username); return ok({ blocked: body.p_username }); }
    if (name === 'sr_unblock') { db.blocks[un] = (db.blocks?.[un] || []).filter(n => n !== body.p_username); return ok({ ok: true }); }
    if (name === 'sr_block_list') return ok(db.blocks?.[un] || []);
    if (name === 'sr_feedback_send') { (db.feedback ||= []).push({ user: un, kind: body.p_kind, body: body.p_body }); return ok({ id: db.feedback.length }); }
    if (name === 'sr_log_error') { (db.errors ||= []).push(body); return ok({ ok: true }); }
    if (name === 'sr_admin_errors') return ok((db.errors || []).map(e => ({ msg: e.p_msg, version: e.p_version, n: 1, users: 1, last: new Date().toISOString(), stack: e.p_stack, place: e.p_place, ua: e.p_ua })));
    if (name === 'sr_admin_grant_code') { if (!db.users[body.p_username]) return ng('not_found'); (db.users[body.p_username].codes ||= []).push(body.p_code); return ok({ ok: true }); }
    if (name === 'sr_admin_set_side') { const u = db.users[body.p_username]; if (!u) return ng('not_found'); const t = Date.now(); (u.codes ||= []).push(`MODE:${body.p_side}:${t}`); if (u.data?.version) { u.data.profile = { ...(u.data.profile || {}), side: body.p_side, sideAt: t }; } return ok({ ok: true }); }
    if (name === 'sr_my_codes') return ok(db.users[un]?.codes || []);
    if (name === 'sr_admin_users') return ok(Object.keys(db.users).map(n => { const pf = db.users[n].data?.profile || {}; return { username: n, created_at: new Date().toISOString(), summary: { xp: pf.xp, solved: pf.solved, correct: pf.correct, mode: pf.mode, side: pf.side, avatar: pf.avatar, avatarColor: pf.avatarColor, title: pf.title }, units: {} }; }));
    if (name === 'sr_admin_delete_user') { if (body.p_username === 'admin') return ng('cannot_delete_admin'); if (!db.users[body.p_username]) return ng('not_found'); delete db.users[body.p_username]; return ok({ deleted: body.p_username }); }
    if (name === 'sr_admin_gift_user') { if (body.p_username !== 'admin' && !db.users[body.p_username]) return ng('not_found'); (db.gifts ||= []).push({ id: 100 + db.gifts.length, title: body.p_title, kind: body.p_kind, amount: body.p_amount, item_id: body.p_item, target: body.p_username, created_at: new Date().toISOString() }); return ok({ id: 1 }); }
    if (name === 'sr_gift_list') return ok([{ id: 1, title: 'いつもありがとう', kind: 'ticket', amount: 3, item_id: null, created_at: new Date().toISOString() }, ...(db.gifts || []).filter(g => 't-' + g.target === body.p_token)]);
    if (name === 'sr_profile') { const d = db.users[body.p_username]?.data; if (!d) return ng('not_found'); const pf = d.profile || {}; return ok({ username: body.p_username, profile: pf, units: Object.fromEntries(Object.entries(d.subjects || {}).map(([k, v]) => [k, v.units || {}])), streak: d.streak, collected: Object.keys(d.house?.collected || {}), admin: body.p_username === 'admin' }); }
    if (name === 'sr_unit_times') return ok(db.unitTimes || {});
    if (name === 'sr_weekly_points') { const top = Object.entries(db.users).filter(([n, u]) => u.data?.profile?.week?.points > 0).sort((a, b) => b[1].data.profile.week.points - a[1].data.profile.week.points).map(([n, u], i) => ({ pos: i + 1, username: n, points: u.data.profile.week.points, solved: u.data.profile.week.solved || 0, puzzle: u.data.profile.week.puzzle || 0, me: 't-' + n === body.p_token, avatar: u.data.profile.avatar, avatarColor: u.data.profile.avatarColor, title: u.data.profile.title })); const me = top.find(x => x.me); return ok({ top, me: me ? { pos: me.pos, points: me.points } : null, total: top.length }); }
    if (name === 'sr_weekly_ranking' || name === 'sr_weekly_puzzle') { const top = Object.entries(db.users).filter(([n, u]) => u.data?.profile).map(([n, u], i) => ({ pos: i + 1, username: n, solved: u.data.profile.solved || 0, correct: u.data.profile.correct || 0, me: 't-' + n === body.p_token, avatar: u.data.profile.avatar, avatarColor: u.data.profile.avatarColor, title: u.data.profile.title })); return ok({ top, me: null, total: top.length }); }
    return ok(null);
  });
};
