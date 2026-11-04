// Supabase（ネット上の保存先）を呼ぶ。
// ここに書くのは公開してよい値だけ（Project URL と Publishable key）。秘密のキーは使わない。
// 表には直接さわれず、supabase/setup.sql の関数（sr_signup / sr_login / sr_load / sr_save / sr_logout）だけを呼ぶ。
export const SUPABASE_URL = 'https://ytvocegvtlgrnxupmbnf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_dRcpHiDz_wRt_SZz4P98TA_oNfDqqy7';

const MESSAGES = {
  name_taken: 'そのユーザー名はもう使われています',
  name_length: 'ユーザー名は2〜16文字にしてください',
  password_short: 'パスワードは4文字以上にしてください',
  bad_login: 'ユーザー名かパスワードがちがいます',
  bad_token: 'ログインが切れました。もう一度ログインしてください',
  no_user: 'そのユーザー名の人は見つかりませんでした',
  self: '自分にはフレンド申請できません',
  not_friend: 'フレンドになっている人の部屋だけ見られます',
  not_admin: '管理者だけが見られます',
  too_many: '送りすぎです。少し時間をおいてください',
  empty: '中身を書いてください',
  not_found: 'そのアカウントは見つかりません',
  cannot_delete_admin: '管理者のアカウントは消せません',
  bad_code: 'コードの形がちがいます',
  missing: 'このしくみはまだ準備中です（管理者が Supabase に登録すると使えます）',
  server: 'うまくいきませんでした。少ししてからもう一度ためしてください',
  offline: 'ネットにつながりませんでした。電波のよい所でもう一度ためしてください',
};

export class CloudError extends Error {
  constructor(code) { super(MESSAGES[code] || MESSAGES.server); this.code = code; }
}

export async function rpc(name, body, opts = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: !!opts.keepalive,
    });
  } catch (e) { throw new CloudError('offline'); }
  const j = await res.json().catch(() => null);
  // 関数がまだ Supabase に登録されていない（PGRST202）は「ネットにつながらない」とはちがう
  if (!res.ok) throw new CloudError(j?.code === 'PGRST202' || res.status === 404 ? 'missing' : (MESSAGES[j?.message] ? j.message : 'server'));
  return j;
}
