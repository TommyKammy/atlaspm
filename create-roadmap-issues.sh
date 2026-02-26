#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-TommyKammy/atlaspm}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"
  if gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" >/dev/null 2>&1; then
    echo "Created label: $name"
  else
    echo "Label exists (or skipped): $name"
  fi
}

ensure_milestone() {
  local title="$1"
  if gh api "repos/$REPO/milestones" -f title="$title" -f state="open" >/dev/null 2>&1; then
    echo "Created milestone: $title"
  else
    echo "Milestone exists (or skipped): $title"
  fi
}

create_issue() {
  local title="$1"
  local milestone="$2"
  local labels="$3"
  local body="$4"

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --milestone "$milestone" \
    --label "$labels" \
    --body "$body"
}

require_cmd gh

echo "Using repository: $REPO"
echo "Preparing labels..."
ensure_label "priority:P0" "B60205" "Critical / must ship first"
ensure_label "priority:P1" "D93F0B" "High impact / next wave"
ensure_label "priority:P2" "FBCA04" "Important / later wave"
ensure_label "area:api" "1D76DB" "core-api backend"
ensure_label "area:web-ui" "5319E7" "web-ui frontend"
ensure_label "area:e2e" "0E8A16" "playwright/e2e"
ensure_label "area:infra" "0052CC" "docker/ops/ci"
ensure_label "area:security" "B60205" "security/auth/audit"
ensure_label "type:feature" "A2EEEF" "new feature"
ensure_label "type:tech-debt" "C5DEF5" "stability and maintenance"

echo "Preparing milestones..."
ensure_milestone "P0 Stability Foundation"
ensure_milestone "P1 Asana-like Productivity"
ensure_milestone "P2 Enterprise Readiness"

echo "Creating issues..."

create_issue \
  "P0: Undo/Trash 完成（削除直後Undo + ゴミ箱復元 + 期限削除）" \
  "P0 Stability Foundation" \
  "priority:P0,type:feature,area:api,area:web-ui,area:e2e" \
  "$(cat <<'EOF'
## 背景
誤削除をユーザー自身で即時回復できる必要がある。

## スコープ
- 削除直後のUndo（例: 10秒）
- ゴミ箱一覧から復元
- 自動削除期限（例: 30日）
- 監査/Outbox整合

## 受け入れ条件
- UIだけで誤削除復旧可能
- 監査イベントに task.deleted/task.restored が残る
- リロード不要で反映
- Playwrightで削除→Undo/復元→再表示を検証

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P0: flaky恒久対策（dependencies/subtasks/search/slack）" \
  "P0 Stability Foundation" \
  "priority:P0,type:tech-debt,area:api,area:web-ui,area:e2e" \
  "$(cat <<'EOF'
## 背景
E2E失敗が集中している領域の安定化が最優先。

## スコープ
- 失敗原因を分類（selector不安定/非同期競合/API応答揺れ）
- テストの待機条件とUI testidを標準化
- APIの競合時エラー形状を統一

## 受け入れ条件
- pnpm e2e を連続3回成功
- rerun依存なし
- 既存アサーションを弱めない

## 検証コマンド
- pnpm test
- pnpm e2e (x3)
EOF
)"

create_issue \
  "P0: Observability強化（core-api/collab/outbox の相関追跡）" \
  "P0 Stability Foundation" \
  "priority:P0,type:tech-debt,area:api,area:infra" \
  "$(cat <<'EOF'
## 背景
運用時の障害切り分け速度を上げる必要がある。

## スコープ
- correlationId を API/Collab/Outbox ログで統一
- 失敗時ログに request path/user/roomId を最低限記録
- 代表ユースケースの追跡手順を docs に明記

## 受け入れ条件
- 1操作を単一correlationIdで横断追跡できる
- 監査イベントにも correlationId が残る

## 検証コマンド
- pnpm test
EOF
)"

create_issue \
  "P1: Boardビュー実機能化（Section列 + DnD + 永続化）" \
  "P1 Asana-like Productivity" \
  "priority:P1,type:feature,area:web-ui,area:api,area:e2e" \
  "$(cat <<'EOF'
## スコープ
- Section列でタスクカード表示
- 列内/列間DnD
- manual order/section移動の永続化

## 受け入れ条件
- DnD後にリロードして順序保持
- 競合時はサーバ順へ復元
- E2Eで列間移動を検証

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P1: Calendarビュー実機能化（due/start 双方向編集）" \
  "P1 Asana-like Productivity" \
  "priority:P1,type:feature,area:web-ui,area:api,area:e2e" \
  "$(cat <<'EOF'
## スコープ
- 月/週表示（MVPは月優先）
- dueAt/startAt のドラッグ編集
- タスク詳細と同値更新

## 受け入れ条件
- Calendar編集がListへ即反映
- リロード後も保持
- E2Eで日付変更の往復検証

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P1: Filesビュー実機能化（添付一覧/絞り込み/削除復元）" \
  "P1 Asana-like Productivity" \
  "priority:P1,type:feature,area:web-ui,area:api,area:e2e" \
  "$(cat <<'EOF'
## スコープ
- プロジェクト内添付ファイル一覧
- uploader/type/date フィルタ
- 添付削除/復元導線

## 受け入れ条件
- 画像/非画像とも一覧表示
- 削除/復元で監査/Outbox記録
- E2Eでアップロード->一覧->削除/復元

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P1: タスク詳細強化（期日リマインド/依存可視化/サブタスク進捗ロールアップ）" \
  "P1 Asana-like Productivity" \
  "priority:P1,type:feature,area:web-ui,area:api" \
  "$(cat <<'EOF'
## スコープ
- 期日リマインド設定
- 依存状態の視覚強調
- サブタスク完了率ロールアップ

## 受け入れ条件
- 日次運用がタスク詳細から完結
- 変更は監査に記録
- 既存E2E回帰なし

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P1: @mention通知（Inbox/通知センター導線）" \
  "P1 Asana-like Productivity" \
  "priority:P1,type:feature,area:web-ui,area:api,area:e2e" \
  "$(cat <<'EOF'
## スコープ
- mention作成時の通知生成
- Inbox/通知センター一覧
- クリックで対象タスクへ遷移

## 受け入れ条件
- mention->通知->対象遷移が1クリック
- 通知重複/欠落なし
- E2Eでmention通知のend-to-end確認

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P2: 権限モデル強化（Workspace/Project権限マトリクス明文化と境界テスト）" \
  "P2 Enterprise Readiness" \
  "priority:P2,type:tech-debt,area:api,area:security,area:e2e" \
  "$(cat <<'EOF'
## スコープ
- 主要操作の権限マトリクス定義
- ガード実装の単一化
- 403/許可の境界テスト整備

## 受け入れ条件
- 想定外の権限昇格なし
- 主要管理APIに権限テストあり

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P2: 招待・ユーザー管理運用完成（失効/再発行/停止挙動統一）" \
  "P2 Enterprise Readiness" \
  "priority:P2,type:feature,area:api,area:web-ui,area:security" \
  "$(cat <<'EOF'
## スコープ
- 招待リンク失効/再発行
- 停止ユーザーの挙動統一
- 管理UIからの運用完結

## 受け入れ条件
- 招待ライフサイクルがUI完結
- 停止中ユーザーの操作が一貫して拒否
- 監査/Outbox整合

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "P2: Slack/Webhook配信基盤強化（再送/DLQ/署名検証）" \
  "P2 Enterprise Readiness" \
  "priority:P2,type:tech-debt,area:api,area:infra,area:security,area:e2e" \
  "$(cat <<'EOF'
## スコープ
- 配信失敗時の再送キュー
- DLQ可視化
- 署名検証とリプレイ耐性強化

## 受け入れ条件
- 一時障害でイベント欠落しない
- 失敗イベントを再実行可能
- セキュリティ検証を追加

## 検証コマンド
- pnpm test
- pnpm e2e
EOF
)"

create_issue \
  "Cross-cutting: Definition of Done 強制（lint/test/e2e + 監査/Outbox回帰）" \
  "P0 Stability Foundation" \
  "type:tech-debt,area:infra,area:e2e" \
  "$(cat <<'EOF'
## 目的
全実装で品質ゲートを固定化する。

## DoD
- pnpm lint
- pnpm test
- pnpm e2e
- 監査/Outbox回帰あり
- リロード不要UXをE2Eで担保
EOF
)"

echo "Done."
