#!/usr/bin/env bash
# Webプッシュ(端末への通知)の鍵(VAPID鍵)を作って、Vercelの本番環境変数に登録する。
# 鍵の値は画面に表示しない。すでに登録されている場合は何もしない(鍵を作り直すと、登録済みの端末に届かなくなるため)。
# 使い方: どこからでも  bash ~/Downloads/reels.locapass/scripts/setup-web-push.sh
# 実行後、本番に反映するには再デプロイが必要(NEXT_PUBLIC_ の値はビルド時に埋め込まれるため)。
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel コマンドが見つかりません。先に Vercel CLI をインストールしてログインしてください。" >&2
  exit 1
fi

existing="$(vercel env ls production 2>/dev/null || true)"
if echo "$existing" | grep -q "NEXT_PUBLIC_VAPID_PUBLIC_KEY" && echo "$existing" | grep -q "VAPID_PRIVATE_KEY"; then
  echo "VAPID鍵はすでに本番に登録されています。何もしません。"
  exit 0
fi

keys="$(npx --yes web-push generate-vapid-keys --json)"
public_key="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).publicKey)' "$keys")"
private_key="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).privateKey)' "$keys")"

# --yes: 途中の確認を既定で進める(対話なしで登録する)。秘密鍵は「秘密扱い」で保存する
printf '%s' "$public_key" | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production --yes >/dev/null
printf '%s' "$private_key" | vercel env add VAPID_PRIVATE_KEY production --sensitive --yes >/dev/null

# 手元の開発用(.env.local はGitに入らない)にも、まだ無ければ入れておく
touch .env.local
grep -q '^NEXT_PUBLIC_VAPID_PUBLIC_KEY=' .env.local || printf 'NEXT_PUBLIC_VAPID_PUBLIC_KEY=%s\n' "$public_key" >> .env.local
grep -q '^VAPID_PRIVATE_KEY=' .env.local || printf 'VAPID_PRIVATE_KEY=%s\n' "$private_key" >> .env.local

echo "完了: VAPID鍵を本番(Vercel)と .env.local に登録しました。再デプロイすると端末通知が使えるようになります。"
