#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-TommyKammy/atlaspm}"

# Optional labels (ignore if already exists)
gh label create "epic" --repo "$REPO" --color "5319e7" --description "Epic issue" 2>/dev/null || true
gh label create "P4" --repo "$REPO" --color "1d76db" --description "Enterprise polish phase" 2>/dev/null || true
gh label create "security" --repo "$REPO" --color "d93f0b" --description "Security and authorization" 2>/dev/null || true
gh label create "frontend" --repo "$REPO" --color "0e8a16" --description "Web UI" 2>/dev/null || true
gh label create "backend" --repo "$REPO" --color "0052cc" --description "Core API / DB" 2>/dev/null || true
gh label create "performance" --repo "$REPO" --color "fbca04" --description "Performance optimization" 2>/dev/null || true

EPIC_URL=$(gh issue create --repo "$REPO" \
  --title "Epic: P4 エンタープライズ仕上げ（権限・履歴比較・大規模性能）" \
  --label "epic" --label "P4" \
  --body "$(cat <<'EOF'
## 目的
AtlasPMをエンタープライズ運用に耐える水準へ仕上げる。

## スコープ
- 権限制御（編集可能ロール）
- 履歴比較UI（変更前後）
- 大規模データ向けインデックス最適化

## 非スコープ
- 仕様緩和によるCI通過
- 監査/認可バイパス
- UIのみの見かけ制御（API防御なし）

## 子Issue
- [ ] P4-1 権限制御（編集可能ロール）
- [ ] P4-2 履歴比較UI（変更前後）
- [ ] P4-3 大規模データ向けインデックス最適化

## Done条件
- pnpm -r --if-present lint
- pnpm -r --if-present test
- pnpm e2e
- 権限逸脱不可（APIで防御）
- 履歴差分が実運用で読める
- 主要クエリp95改善を数値提示
EOF
)")

EPIC_NO="${EPIC_URL##*/}"
echo "Created Epic: $EPIC_URL"

gh issue create --repo "$REPO" \
  --title "P4-1: 権限制御（編集可能ロール）をAPI中心で一元化" \
  --label "P4" --label "security" --label "backend" --label "frontend" \
  --body "$(cat <<EOF
親Epic: #$EPIC_NO

## 目的
ロール別の編集可否をAPI側で厳密に保証し、UIは補助表示にする。

## 実装
- PermissionService + Guardで認可判定を集約
- ロールマトリクス確定
  - VIEWER: 読み取りのみ
  - MEMBER: タスク編集/並び替え/コメント
  - ADMIN: メンバー管理/ルール管理/設定
- 主要エンドポイントへ認可適用
- 403エラー形を統一（correlationId含む）
- UIはdisable + 理由表示（最終防御はAPI）

## 受け入れ条件
- API経由の権限逸脱が不可
- VIEWER/MEMBER/ADMINのE2Eが期待どおり
- 既存機能回帰なし
EOF
)"

gh issue create --repo "$REPO" \
  --title "P4-2: 履歴比較UI（変更前後）をTask Activityに実装" \
  --label "P4" --label "frontend" --label "backend" \
  --body "$(cat <<EOF
親Epic: #$EPIC_NO

## 目的
AuditEventのbefore/afterを人間が読める差分として表示する。

## 実装
- 差分生成ロジック追加（updatedAt/version等ノイズ除外）
- API拡張
  - GET /tasks/:id/audit
  - GET /tasks/:id/audit/:eventId/diff または includeDiff
- Task詳細Activityで Before/After 2カラム表示
- ProseMirror説明はテキスト化差分で表示

## 受け入れ条件
- 主要更新（status/progress/assignee/due/description）が差分表示される
- リロード後も差分表示が再現
- 監査情報の可読性が改善される
EOF
)"

gh issue create --repo "$REPO" \
  --title "P4-3: 大規模データ向けインデックス最適化（計測駆動）" \
  --label "P4" --label "backend" --label "performance" \
  --body "$(cat <<EOF
親Epic: #$EPIC_NO

## 目的
タスク一覧/検索/監査参照のp95を改善し、データ増大時の劣化を抑制する。

## 実装
- 遅いクエリを特定（EXPLAIN ANALYZE, 実測）
- 候補インデックス追加
  - tasks(project_id, section_id, rank)
  - tasks(project_id, status, assignee_user_id, due_at)
  - tasks(project_id, updated_at desc)
  - audit_events(entity_type, entity_id, created_at desc)
  - 必要時GIN(tags/jsonb)
- migration適用（ロック影響に配慮）
- 追加前後で性能比較レポート作成

## 受け入れ条件
- 主要クエリのp95改善を数値で提示
- 書き込み性能悪化が許容範囲
- 既存テスト/E2Eが通過
EOF
)"

echo
echo "Created issues:"
gh issue list --repo "$REPO" --search "P4" --limit 20
