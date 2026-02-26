#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./create-uiux-improvement-issues.sh
#   REPO=owner/repo ./create-uiux-improvement-issues.sh

REPO="${REPO:-TommyKammy/atlaspm}"

tmpfiles=()
cleanup() {
  for f in "${tmpfiles[@]:-}"; do
    [ -f "$f" ] && rm -f "$f"
  done
}
trap cleanup EXIT

mktempfile() {
  local f
  f="$(mktemp)"
  tmpfiles+=("$f")
  echo "$f"
}

extract_issue_number() {
  local url="$1"
  echo "${url##*/}"
}

create_issue() {
  local title="$1"
  local body_file="$2"
  shift 2
  gh issue create --repo "$REPO" --title "$title" --body-file "$body_file" "$@"
}

echo "Creating P0/P1 UIUX issue set in $REPO ..."

# -------------------------
# P0 Epic
# -------------------------
epic_p0_body="$(mktempfile)"
cat > "$epic_p0_body" <<'EOF'
## Goal
UI/UX改善の土台を先に固める（情報集約、導線整理、完了更新API、検索統合）。

## Child Issues
- [ ] P0-1 ヘッダー/ナビ整理（検索統合、説明文削除、Add new移動）
- [ ] P0-2 バックエンド補強（完了一括更新API、セクション横断検索統合）
- [ ] P0-3 E2E回帰担保（リロード不要、完了更新、検索、DnD）

## Done Criteria
- 検索導線が重複しない
- 完了操作が1アクションで `status/progress` 一貫更新
- `pnpm --filter @atlaspm/core-api test` と `pnpm e2e` がグリーン
EOF

EPIC_P0_URL="$(create_issue \
  "EPIC: P0 UI/UX基盤改善（ヘッダー整理・完了API・検索統合）" \
  "$epic_p0_body" \
  --label "priority:P0" \
  --label "area:web-ui" \
  --label "area:api" \
  --label "area:e2e" \
  --label "type:feature")"
EPIC_P0_NUM="$(extract_issue_number "$EPIC_P0_URL")"

# P0-1
p0_1_body="$(mktempfile)"
cat > "$p0_1_body" <<EOF
Parent Epic: #${EPIC_P0_NUM}

## スコープ
- ヘッダー検索とプロジェクト内検索の重複を解消
- 「手動並び替え対応...」説明文を削除
- プロジェクト名を強調（大きく/太字）
- 「+ Add new」をタブ行（List右隣）へ移動
- Members/Rules導線をヘッダーアクションに統一

## 受け入れ条件
- 画面上で検索導線が重複しない
- Add newの位置がタブ行に固定
- 見出し階層が明確（プロジェクト名が主見出し）

## 検証コマンド
- pnpm --filter @atlaspm/web-ui build
- pnpm e2e
EOF

P0_1_URL="$(create_issue \
  "P0-1: ヘッダー/ナビ整理（検索統合・Add new移動・見出し改善）" \
  "$p0_1_body" \
  --label "priority:P0" \
  --label "area:web-ui" \
  --label "area:e2e" \
  --label "type:feature")"

# P0-2
p0_2_body="$(mktempfile)"
cat > "$p0_2_body" <<EOF
Parent Epic: #${EPIC_P0_NUM}

## スコープ
- 完了一括更新APIを追加（チェック操作向け）
  - 例: POST /tasks/:id/complete { done, version }
- done=true で status=DONE, progressPercent=100, completedAt=now
- done=false で reopenedロジック（status/completedAt）を一貫更新
- 監査/Outboxイベントを追加
- プロジェクトタスク検索の q を section.name まで拡張

## 受け入れ条件
- フロントの完了チェックが単一APIで整合更新できる
- セクション名でタスク検索できる
- 監査/Outboxが欠落しない

## 検証コマンド
- pnpm --filter @atlaspm/core-api lint
- pnpm --filter @atlaspm/core-api type-check
- pnpm --filter @atlaspm/core-api test
EOF

P0_2_URL="$(create_issue \
  "P0-2: API補強（完了一括更新 + セクション横断検索）" \
  "$p0_2_body" \
  --label "priority:P0" \
  --label "area:api" \
  --label "type:feature")"

# P0-3
p0_3_body="$(mktempfile)"
cat > "$p0_3_body" <<EOF
Parent Epic: #${EPIC_P0_NUM}

## スコープ
- E2Eに以下を追加/強化
  - Add new位置と操作
  - 完了チェック -> status/progress更新
  - リロード後の状態維持
  - セクション名検索
  - DnD後の順序維持
- 既存回帰（admin/collab/rules等）を壊さない

## 受け入れ条件
- no-refresh UX をE2Eで担保
- 主要導線がすべてリロード耐性を持つ
- 既存E2Eが退行しない

## 検証コマンド
- pnpm e2e
- pnpm e2e:stability
EOF

P0_3_URL="$(create_issue \
  "P0-3: E2E回帰強化（完了更新・検索・DnD・リロード耐性）" \
  "$p0_3_body" \
  --label "priority:P0" \
  --label "area:e2e" \
  --label "area:web-ui" \
  --label "type:tech-debt")"

# -------------------------
# P1 Epic
# -------------------------
epic_p1_body="$(mktempfile)"
cat > "$epic_p1_body" <<'EOF'
## Goal
Asana寄りの高密度・低ノイズなタスクリスト体験に仕上げる。

## Child Issues
- [ ] P1-1 行密度最適化（余白圧縮、ボーダレス編集）
- [ ] P1-2 ステータス表現刷新（色バッジ、完了視覚効果）
- [ ] P1-3 行全体DnD（Dragラベル廃止、競合時復元UX）

## Done Criteria
- 一画面あたり表示行数が増える
- 編集時のみ枠表示のフラットUI
- 行全体DnDが安定し、競合時にサーバ順へ復元
EOF

EPIC_P1_URL="$(create_issue \
  "EPIC: P1 Asana寄せリストUX（密度・視認性・行DnD）" \
  "$epic_p1_body" \
  --label "priority:P1" \
  --label "area:web-ui" \
  --label "area:e2e" \
  --label "type:feature")"
EPIC_P1_NUM="$(extract_issue_number "$EPIC_P1_URL")"

# P1-1
p1_1_body="$(mktempfile)"
cat > "$p1_1_body" <<EOF
Parent Epic: #${EPIC_P1_NUM}

## スコープ
- タスク行のpadding/heightを圧縮（8pxグリッド厳守）
- 進捗/ステータス入力を通常時フラット、hover/focusで枠表示
- フィールド視認性を保ったまま情報密度を向上

## 受け入れ条件
- 行高が現行より低い
- 常時枠線が消え、hover/focus時のみ表示
- 可読性を損なわない

## 検証コマンド
- pnpm --filter @atlaspm/web-ui build
- pnpm e2e
EOF

P1_1_URL="$(create_issue \
  "P1-1: タスクリスト密度改善（行高圧縮・ボーダレス編集）" \
  "$p1_1_body" \
  --label "priority:P1" \
  --label "area:web-ui" \
  --label "type:feature")"

# P1-2
p1_2_body="$(mktempfile)"
cat > "$p1_2_body" <<EOF
Parent Epic: #${EPIC_P1_NUM}

## スコープ
- ステータスを色付き角丸バッジ化（TODO/IN_PROGRESS/DONE/BLOCKED）
- 完了チェックボタンをタスク名左に追加
- DONE時に line-through / グレーアウト / 緑チェック適用

## 受け入れ条件
- ステータスが文字列select中心から視認性高い表現へ移行
- 完了状態が一目で分かる
- 完了時スタイルがリロード後も維持

## 検証コマンド
- pnpm --filter @atlaspm/web-ui build
- pnpm e2e
EOF

P1_2_URL="$(create_issue \
  "P1-2: ステータス表現刷新（バッジ化・完了視覚効果）" \
  "$p1_2_body" \
  --label "priority:P1" \
  --label "area:web-ui" \
  --label "area:e2e" \
  --label "type:feature")"

# P1-3
p1_3_body="$(mktempfile)"
cat > "$p1_3_body" <<EOF
Parent Epic: #${EPIC_P1_NUM}

## スコープ
- Dragラベル/専用ハンドル依存を廃止
- タスク行全体をDnD可能にする（入力操作との競合を回避）
- 競合時にサーバ順へ復元するUIハンドリングを強化

## 受け入れ条件
- 行のどこでもDnD開始できる（編集UI除く）
- reorder失敗時のロールバックが正しく動作
- セクション内/セクション間移動が安定

## 検証コマンド
- pnpm --filter @atlaspm/core-api test
- pnpm e2e
EOF

P1_3_URL="$(create_issue \
  "P1-3: 行全体DnD（Drag廃止・競合復元UX）" \
  "$p1_3_body" \
  --label "priority:P1" \
  --label "area:web-ui" \
  --label "area:e2e" \
  --label "area:api" \
  --label "type:feature")"

echo "Created issues:"
echo "  P0 Epic : $EPIC_P0_URL"
echo "  P0-1    : $P0_1_URL"
echo "  P0-2    : $P0_2_URL"
echo "  P0-3    : $P0_3_URL"
echo "  P1 Epic : $EPIC_P1_URL"
echo "  P1-1    : $P1_1_URL"
echo "  P1-2    : $P1_2_URL"
echo "  P1-3    : $P1_3_URL"
