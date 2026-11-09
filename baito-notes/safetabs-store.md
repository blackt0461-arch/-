# SafeTabs（タブ保存の拡張）Chrome ウェブストアに出す手順と入力内容

## 出す前に、本人がやること
1. Chrome ウェブストアの開発者に登録する：https://chrome.google.com/webstore/devconsole
   - 自分の Google アカウントでログインします（パスワードはチャットに貼らないでください）。
   - 登録料 5ドル（1回だけ）を払います。2段階認証をオンにしておきます。
   - 名前を出す欄（Publisher name）は「KOTETSU WORKS」にします。
2. 「新しいアイテム」→ このフォルダの `safetabs-1.0.0.zip` をアップロードします。
3. 下の内容を、それぞれの欄にコピーします。
4. 画像（`portfolio/` ではなく `safetabs-store/` フォルダ）をアップロードします。
5. 「審査に提出」。審査は数日かかることがあります。

---

## ストアの欄に入れる内容

**カテゴリ**：仕事効率化（Productivity）> Tools
**言語**：英語（日本語の説明は「日本語」を追加して入れます）

### 説明（英語）
SafeTabs saves all the tabs in your window with one click, so your browser runs lighter — and your saved tabs never disappear.

Many tab savers have lost people's saved tabs, removed features or suddenly become paid. SafeTabs is built around one promise: your tabs stay safe.

WHY SAFETABS
• One click: save every tab in the window (or just the current tab) and close them to free memory
• Automatic backups: a copy is kept before every change (latest 10), restore any of them in one click
• 30-day trash: deleted groups can be put back for 30 days, plus instant “Undo”
• Crash recovery: your open tabs are copied every 5 minutes, so you can get them back after the browser closes unexpectedly
• Move from OneTab: import OneTab exports (“URL | title” lines) or any list of URLs
• Export everything to a JSON file at any time
• Name your groups, search across all saved tabs, reopen in a new window
• Keyboard shortcut: Alt+Shift+S
• Light and dark mode, English and Japanese

PRIVATE BY DESIGN
Your tabs are stored only in your browser. SafeTabs has no servers, no account, no tracking and no ads.

### 説明（日本語）
SafeTabs は、ウィンドウのタブをワンクリックでまとめて保存して、ブラウザを軽くします。保存したタブは消えません。

タブ保存の拡張では「保存したタブが消えた」「機能がなくなった」「急に有料になった」という声が少なくありません。SafeTabs は「タブを失わない」ことをいちばん大事にして作りました。

できること
・ワンクリックで、ウィンドウのタブ全部（またはいまのタブだけ）を保存して閉じる
・自動の控え：変更のたびに前の状態を控え（最新10個）、いつでも戻せる
・30日のゴミ箱：消したグループは30日間戻せる。すぐの「取り消す」も
・落ちたあとの復元：開いているタブを5分ごとに控えるので、ブラウザが急に閉じても戻せる
・OneTab から乗りかえ：OneTab の書き出し（「URL | タイトル」の行）を読みこめる
・いつでも JSON ファイルに書き出せる
・グループに名前をつける、全部の中からさがす、新しいウィンドウで開く
・ショートカット：Alt+Shift+S
・ライト／ダーク表示、日本語・英語

プライバシー
タブはあなたのブラウザの中だけに保存されます。サーバー・アカウント・追跡・広告はありません。

### 単一用途（Single purpose）
Save and restore browser tabs safely, with local backups so saved tabs are never lost.

### 権限の理由（Permission justification）
- tabs: To read the title and URL of the tabs the user chooses to save, to close them after saving, and to reopen them.
- storage: To store the user's saved tabs, backups and settings locally on the device.
- unlimitedStorage: Users may save thousands of tabs plus 10 backups; this avoids the local storage limit and prevents data loss.
- alarms: To create a crash-recovery copy of open tabs every 5 minutes.
- favicon: To show site icons next to saved tabs.
- リモートコード：使っていません（No, I am not using remote code）。

### データの取り扱い（Privacy practices）
- 集めるデータ：なし（「Web history」なども含めて、どれにもチェックしない）。
  ※タブのURLはパソコンの中だけに保存し、外に送らないため。
- 3つの約束（売らない・目的外に使わない・信用の判断に使わない）にチェック。
- プライバシーポリシーのURL：https://kotetsuworks.com/baito/safetabs/privacy.html

### 画像
- アイコン 128×128：`tab-saver/icons/128.png`
- スクリーンショット 1280×800：`safetabs-store/` の 6枚（英語3枚・日本語3枚）

---

## お金について（正直に）
- 最初は**無料**で出して、使う人とレビューを集めます。拡張は、使う人が増えてから稼ぐのがふつうです。
- 使う人が数百〜1,000人をこえたら、「Pro版（買い切り 500〜1,500円）」を足すことを考えます。中身の候補：サイトごとの自動グループ分け、決まった時間に開き直す、複数のパソコンの間で手動で同期するファイル。
- 有料にするときは、外部の決済（ExtensionPay＋Stripe など）を使います。そのときに改めて手数料やきまりを調べます。
