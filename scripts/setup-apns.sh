#!/usr/bin/env bash
# ロカわんのiPhoneアプリへのプッシュ通知(APNs)の鍵を、Vercelの本番環境変数と .env.local に登録する。
# 鍵(.p8)の中身は画面に表示しない。すでに登録されている場合は何もしない。
#
# 事前に、Appleの開発者サイトで鍵を作ってダウンロードしておく(1回しかダウンロードできない):
#   https://developer.apple.com/account/resources/authkeys/list → 「+」→ 名前を付け、
#   「Apple Push Notifications service (APNs)」(と、あとでアカウント削除に使う「Sign in with Apple」)にチェック → 作成
#   → 「Key ID」(10文字)をメモし、AuthKey_XXXXXXXXXX.p8 をダウンロード
#
# 使い方:  bash ~/Downloads/wt-locapass-app-link/scripts/setup-apns.sh  /ダウンロードした/AuthKey_XXXXXXXXXX.p8  XXXXXXXXXX(Key ID)
# 実行後、本番に反映するには再デプロイが必要。
set -euo pipefail
cd "$(dirname "$0")/.."
# Vercelのプロジェクトにひもづいたフォルダ(.vercel があるところ)で実行する。
# このスクリプトを別の作業フォルダ(git worktree)から実行したときは、いつもの reels.locapass に移る。
if [ ! -f .vercel/project.json ] && [ -f "$HOME/Downloads/reels.locapass/.vercel/project.json" ]; then
  cd "$HOME/Downloads/reels.locapass"
fi

p8_path="${1:-}"
key_id="${2:-}"
if [ -z "$p8_path" ] || [ -z "$key_id" ]; then
  echo "使い方: bash scripts/setup-apns.sh /パス/AuthKey_XXXXXXXXXX.p8 XXXXXXXXXX" >&2
  exit 1
fi
if [ ! -f "$p8_path" ]; then
  echo "ファイルが見つかりません: $p8_path" >&2
  exit 1
fi
if ! grep -q "BEGIN PRIVATE KEY" "$p8_path"; then
  echo "これは .p8 の鍵ファイルではないようです(BEGIN PRIVATE KEY がありません)。" >&2
  exit 1
fi
if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel コマンドが見つかりません。先に Vercel CLI をインストールしてログインしてください。" >&2
  exit 1
fi

existing="$(vercel env ls production 2>/dev/null || true)"
if echo "$existing" | grep -q "APNS_KEY_P8"; then
  echo "APNsの鍵はすでに本番に登録されています。何もしません。"
  exit 0
fi

# 改行を \n に直した1行にして保存する(環境変数に入れやすくするため。送信側で元に戻す)
p8_oneline="$(awk 'NF {printf "%s\\n", $0}' "$p8_path")"

printf '%s' "$p8_oneline" | vercel env add APNS_KEY_P8 production --sensitive --yes >/dev/null
printf '%s' "$key_id" | vercel env add APNS_KEY_ID production --yes >/dev/null
printf '%s' "7D746B5DRM" | vercel env add APNS_TEAM_ID production --yes >/dev/null
printf '%s' "net.locapass.pet" | vercel env add APNS_BUNDLE_ID production --yes >/dev/null

touch .env.local
grep -q '^APNS_KEY_P8=' .env.local || printf 'APNS_KEY_P8=%s\n' "$p8_oneline" >> .env.local
grep -q '^APNS_KEY_ID=' .env.local || printf 'APNS_KEY_ID=%s\n' "$key_id" >> .env.local
grep -q '^APNS_TEAM_ID=' .env.local || printf 'APNS_TEAM_ID=7D746B5DRM\n' >> .env.local
grep -q '^APNS_BUNDLE_ID=' .env.local || printf 'APNS_BUNDLE_ID=net.locapass.pet\n' >> .env.local

echo "完了: APNsの鍵を本番(Vercel)と .env.local に登録しました。再デプロイすると、アプリへの通知が使えるようになります。"
echo "鍵ファイル(.p8)は、安全な場所に保管してください(Appleから再ダウンロードできません)。"
