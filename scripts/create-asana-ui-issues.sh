#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-TommyKammy/atlaspm}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd gh
require_cmd jq

ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null || true
}

ensure_milestone() {
  local title="$1"
  local desc="$2"
  if ! gh api "repos/${REPO}/milestones?state=all&per_page=100" --paginate \
    | jq -e --arg t "$title" '.[] | select(.title == $t)' >/dev/null; then
    gh api "repos/${REPO}/milestones" -X POST -f title="$title" -f description="$desc" >/dev/null
  fi
}

milestone_number() {
  local title="$1"
  gh api "repos/${REPO}/milestones?state=all&per_page=100" --paginate \
    | jq -r --arg t "$title" '.[] | select(.title == $t) | .number' | head -n1
}

existing_issue_url_by_title() {
  local title="$1"
  gh api "repos/${REPO}/issues?state=all&per_page=100" --paginate \
    | jq -r --arg t "$title" '.[] | select((has("pull_request") | not) and .title == $t) | .html_url' \
    | head -n1
}

create_issue() {
  local title="$1"
  local body="$2"
  local milestone_title="$3"
  local labels_csv="$4"

  local existing_url
  existing_url="$(existing_issue_url_by_title "$title")"
  if [[ -n "${existing_url}" ]]; then
    echo "$existing_url"
    return
  fi

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --milestone "$milestone_title" \
    --label "$labels_csv"
}

echo "Preparing labels and milestones in ${REPO}..."

# labels
ensure_label "epic" "5319E7" "Epic issue"
ensure_label "phase:P0" "0E8A16" "Phase 0"
ensure_label "phase:P1" "1D76DB" "Phase 1"
ensure_label "phase:P2" "0052CC" "Phase 2"
ensure_label "phase:P3" "5319E7" "Phase 3"
ensure_label "phase:P4" "8250DF" "Phase 4"
ensure_label "phase:P5" "B60205" "Phase 5"
ensure_label "phase:P6" "D93F0B" "Phase 6"
ensure_label "area:web-ui" "FBCA04" "Web UI"
ensure_label "area:e2e" "C2E0C6" "E2E"
ensure_label "priority:P0-critical" "B60205" "Critical"
ensure_label "priority:P1-high" "D93F0B" "High"
ensure_label "priority:P2-medium" "FBCA04" "Medium"
ensure_label "priority:P3-low" "C2E0C6" "Low"

# milestones
ensure_milestone "Asana UI - Phase 0" "Parity rubric and QA gate definition"
ensure_milestone "Asana UI - Phase 1" "Design tokens and AppShell"
ensure_milestone "Asana UI - Phase 2" "List structure alignment"
ensure_milestone "Asana UI - Phase 3" "Row UX and inline editing"
ensure_milestone "Asana UI - Phase 4" "Subtask tree and DnD integrity"
ensure_milestone "Asana UI - Phase 5" "Micro-interactions and shortcuts"
ensure_milestone "Asana UI - Phase 6" "Regression hardening and docs"

echo "Creating epic and phase issues..."

EPIC_URL="$(create_issue \
"Epic: AtlasPM UI Asana-like parity (List UX refresh)" \
"## Goal
AtlasPMのTask List UIをAsanaライクな情報設計・密度・操作感へ段階導入する。

## Non-goals
- 認証方式変更
- core-api境界変更（web-ui->core-api API only）
- DB直結

## Definition of Done
- pnpm -r --if-present lint/test/build が通る
- pnpm e2e が通る
- リロード不要で主要操作（追加/編集/並び替え/折り畳み）が完了
- 事前合意したVisual/UX指標を満たす" \
"Asana UI - Phase 0" \
"epic,area:web-ui,priority:P1-high")"

echo "EPIC: ${EPIC_URL}"

create_issue "P0-1: Visual/UX parity rubric を定義" \
"Epic: ${EPIC_URL}

## Scope
- Asana比較指標（行高、余白、列密度、状態表現）定義
- 操作指標（追加/編集/並び替え/折り畳み）定義

## AC
- docsに指標表追加
- 以後Issueが指標参照" \
"Asana UI - Phase 0" \
"phase:P0,area:web-ui,priority:P1-high" >/dev/null

create_issue "P0-2: QAシナリオと回帰ゲート定義" \
"Epic: ${EPIC_URL}

## Scope
- Playwright対象フロー固定
- CI回帰ゲート定義

## AC
- docsにE2E対象一覧
- 必須コマンド明文化" \
"Asana UI - Phase 0" \
"phase:P0,area:e2e,priority:P1-high" >/dev/null

create_issue "P1-1: Asana寄りデザイントークン導入" \
"Epic: ${EPIC_URL}

## Scope
- color/spacing/typographyトークン整理
- 直書き色の削減

## AC
- トークン経由描画
- light/dark両対応" \
"Asana UI - Phase 1" \
"phase:P1,area:web-ui,priority:P1-high" >/dev/null

create_issue "P1-2: AppShell再構成（左3ブロック + 上部バー）" \
"Epic: ${EPIC_URL}

## Scope
- 左ナビ再編
- 上部Create/Search/User配置

## AC
- 主要ページで一貫シェル
- /login除外" \
"Asana UI - Phase 1" \
"phase:P1,area:web-ui,priority:P1-high" >/dev/null

create_issue "P1-3: Sidebar折り畳み状態の永続化" \
"Epic: ${EPIC_URL}

## Scope
- cookie/localStorageで状態保持

## AC
- リロード後復元
- モバイル/デスクトップ整合" \
"Asana UI - Phase 1" \
"phase:P1,area:web-ui,priority:P2-medium" >/dev/null

create_issue "P2-1: プロジェクトヘッダをAsana構造へ" \
"Epic: ${EPIC_URL}

## Scope
- タイトル + ビュータブ + Add/Filter/Group/Sort

## AC
- 情報配置が仕様一致" \
"Asana UI - Phase 2" \
"phase:P2,area:web-ui,priority:P1-high" >/dev/null

create_issue "P2-2: テーブル列再構成（Asanaライク）" \
"Epic: ${EPIC_URL}

## Scope
- Name/Due/Projects/Dependencies/Visibility/Collaborators

## AC
- 列幅/密度が基準一致" \
"Asana UI - Phase 2" \
"phase:P2,area:web-ui,priority:P1-high" >/dev/null

create_issue "P2-3: セクションヘッダ行の統一" \
"Epic: ${EPIC_URL}

## Scope
- トグル/件数/区切り線/空状態統一

## AC
- 全セクション同一挙動" \
"Asana UI - Phase 2" \
"phase:P2,area:web-ui,priority:P2-medium" >/dev/null

create_issue "P3-1: タスク行のAsana風コンポジション" \
"Epic: ${EPIC_URL}

## Scope
- 行内情報配置見直し（完了トグル/タイトル/メタ）

## AC
- hover/selected/focus一貫" \
"Asana UI - Phase 3" \
"phase:P3,area:web-ui,priority:P1-high" >/dev/null

create_issue "P3-2: インライン編集導線統一" \
"Epic: ${EPIC_URL}

## Scope
- click編集、Enter保存、Esc取消

## AC
- 主要セルで同一編集モデル" \
"Asana UI - Phase 3" \
"phase:P3,area:web-ui,priority:P1-high" >/dev/null

create_issue "P3-3: Assignee/Badge/Avatar視覚調整" \
"Epic: ${EPIC_URL}

## Scope
- avatar/pill/badge密度最適化

## AC
- 表示崩れなし（desktop/mobile）" \
"Asana UI - Phase 3" \
"phase:P3,area:web-ui,priority:P2-medium" >/dev/null

create_issue "P4-1: 親子ツリー表示強化（インデント/トグル/件数）" \
"Epic: ${EPIC_URL}

## Scope
- 親子の視認性改善
- 折り畳み導線強化

## AC
- 親子構造が一目で認識可能" \
"Asana UI - Phase 4" \
"phase:P4,area:web-ui,priority:P1-high" >/dev/null

create_issue "P4-2: ツリーとDnDルール整合（階層破壊防止）" \
"Epic: ${EPIC_URL}

## Scope
- DnD許可/禁止ルール明確化
- parentId整合保護

## AC
- 階層破壊再現なし" \
"Asana UI - Phase 4" \
"phase:P4,area:web-ui,priority:P0-critical" >/dev/null

create_issue "P4-3: ツリー操作E2E拡張" \
"Epic: ${EPIC_URL}

## Scope
- 折り畳み/親子表示/DnD制約をE2E追加

## AC
- 新規E2E安定通過" \
"Asana UI - Phase 4" \
"phase:P4,area:e2e,priority:P1-high" >/dev/null

create_issue "P5-1: 微アニメーション統一（150ms）" \
"Epic: ${EPIC_URL}

## Scope
- 折り畳み/行移動/パネル開閉の遷移統一

## AC
- 操作ノイズ低減
- パフォーマンス劣化なし" \
"Asana UI - Phase 5" \
"phase:P5,area:web-ui,priority:P2-medium" >/dev/null

create_issue "P5-2: キーボードショートカット導入" \
"Epic: ${EPIC_URL}

## Scope
- C, /, Tab など主要ショートカット

## AC
- 主要導線がキーボード完結" \
"Asana UI - Phase 5" \
"phase:P5,area:web-ui,priority:P2-medium" >/dev/null

create_issue "P5-3: 保存状態/競合バナーの見える化" \
"Epic: ${EPIC_URL}

## Scope
- Saving/Saved表示、409競合導線

## AC
- 状態遷移が常時観測可能" \
"Asana UI - Phase 5" \
"phase:P5,area:web-ui,priority:P1-high" >/dev/null

create_issue "P6-1: Playwright回帰セット更新" \
"Epic: ${EPIC_URL}

## Scope
- 新UI用セレクタ更新
- 主要フロー回帰追加

## AC
- pnpm e2e green
- flaky増加なし" \
"Asana UI - Phase 6" \
"phase:P6,area:e2e,priority:P1-high" >/dev/null

create_issue "P6-2: Visual regression（主要ページ）" \
"Epic: ${EPIC_URL}

## Scope
- light/darkのスナップショット比較導入

## AC
- 意図しない崩れを検知可能" \
"Asana UI - Phase 6" \
"phase:P6,area:web-ui,priority:P2-medium" >/dev/null

create_issue "P6-3: UIガイド/運用ドキュメント更新" \
"Epic: ${EPIC_URL}

## Scope
- token規約/状態規約/E2E運用規約の文書化

## AC
- 新規参加者が再現可能" \
"Asana UI - Phase 6" \
"phase:P6,area:web-ui,priority:P2-medium" >/dev/null

echo "Done. Issues are ready."
