#!/bin/bash
# GitLab（kotetsu-works-group・非公開）に、このリポジトリを送る。2026-11-07
#   bash tools/gitlab/push.sh            → 送るだけ
#   bash tools/gitlab/push.sh --deploy   → 送ったあと、いまのブランチに「deploy-日時」のタグを付けて送る
#                                          （GitLab の自動作業が kotetsuworks.com に公開する。.gitlab-ci.yml）
# ・鍵は環境「全部許可」の gitlab.com 宛てに保存してあり、通信の途中で自動で付く（URL に鍵を書かない）。
# ・この写しは履歴が途中から（GitHub が止まる前の浅い写し）なので、GitLab が受け付けない。
#   そこで、別の場所に写しを作り、途中の記録を「最初の記録」として作り直してから送る。中身は同じ。
#   作り直しは毎回同じ結果になるので、2回目からは増えた分だけが送られる。
# ・cat-model/reference（他の人の参考写真）は、履歴からも外して送る（きまり：他人の素材は送らない）。
set -e
DEPLOY=$1
BR=$(git -C "$(dirname "$0")" rev-parse --abbrev-ref HEAD)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=${TMPDIR:-/tmp}/kotetsu-gitlab; DST=$WORK/site.git; mkdir -p "$WORK"
rm -rf "$DST"; cp -a "$ROOT/.git" "$DST"; cd "$DST"; git config core.bare true
git for-each-ref --format='%(refname)' refs/remotes/origin | grep -v HEAD | while read r; do
  b=${r#refs/remotes/origin/}
  # 手元に同じ名前が無い・手元の方が古い時は、GitHub から取ってあった方を使う
  if ! git show-ref -q --verify refs/heads/$b || git merge-base --is-ancestor refs/heads/$b $r; then git update-ref refs/heads/$b $r; fi; done
[ -f shallow ] && for c in $(sort -u shallow); do git replace --graft $c; done
export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch -f --index-filter "git rm -r -q --cached --ignore-unmatch cat-model/reference" --prune-empty -- --branches --tags >/dev/null 2>&1
git for-each-ref --format='%(refname)' refs/replace refs/original refs/remotes | xargs -r -n1 git update-ref -d
rm -f shallow
# main は担当がじかに足すことがある（テスト勉強担当など）ので、ここでは送らない。送るのは作業ブランチだけ
git push "https://gitlab.com/kotetsu-works-group/kotetsuworks-site.git" "refs/heads/$BR:refs/heads/$BR"
echo "送りました：https://gitlab.com/kotetsu-works-group/kotetsuworks-site"
if [ "$DEPLOY" = "--deploy" ]; then
  TAG=deploy-$(date -u +%Y%m%d-%H%M%S); git tag "$TAG" "refs/heads/$BR"
  git push "https://gitlab.com/kotetsu-works-group/kotetsuworks-site.git" "refs/tags/$TAG"
  echo "公開の合図を出しました（$TAG・$BR）。数分で kotetsuworks.com に出ます。"
fi
