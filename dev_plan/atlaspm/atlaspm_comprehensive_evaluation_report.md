# AtlasPM リポジトリ包括的評価レポート

**調査日**: 2026年3月4日  
**リポジトリ**: https://github.com/TommyKammy/atlaspm  
**ブランチ**: main  
**評価対象**: Asanaライクなプロジェクト管理ツール（ヘッドレス・ルール駆動型コア）

---

## Executive Summary

### 総合完成度: **75%** （Asana代替としての実用可能度）

AtlasPMはエンタープライズ内部向けプロジェクト管理ツールとして、**MVP水準を達成**しています。ヘッドレス設計、モノレポ構成、先進的な技術スタックを採用しており、実用的な機能セットを提供しています。ただし、セキュリティ面でのCriticalリスクと、ドメイン層の適用範囲が限定的である点が主要な課題です。

### 主要リスク: Top 3

| 優先度 | リスク | 影響度 |
|--------|--------|--------|
| 🔴 **Critical** | Dev認証エンドポイントの無保護（誰でも任意ユーザーとしてログイン可能） | セキュリティ |
| 🟠 **High** | ドメイン層は部分適用（横断展開が未完） | アーキテクチャ |
| 🟠 **High** | tasks.controller.tsの肥大化（2,454行） | 保守性 |

### 推奨アクション（即座に対応）

1. **Dev認証エンドポイントの無効化またはIP制限導入**
2. **ドメイン層の横展開（既存domain実装を主要ユースケースへ拡大）**
3. **tasks.controller.tsのリファクタリング（Service層へのロジック移動）**

---

## 1. アーキテクチャ健全性スコア

| 評価項目 | スコア | 評価 |
|---------|-------|------|
| モジュール性 | 7/10 | B |
| 拡張性 | 6/10 | C+ |
| 保守性 | 5/10 | C |

**総合評価**: C+ (18/30点)

### 詳細分析

#### ✅ 強み

| 項目 | 詳細 |
|------|------|
| モノレポ構成 | pnpm workspaceが正しく設定、Node.js 20.x/pnpm 9.xを固定 |
| マイクロサービス境界 | core-api (REST)、collab-server (Yjs)、web-ui (Next.js)の責務分離が適切 |
| TypeScript厳格性 | `strict: true`, `noUncheckedIndexedAccess: true`を設定 |

#### ❌ 弱み

| 項目 | 詳細 | コード参照 |
|------|------|-----------|
| ドメイン層は部分適用 | `packages/domain` に entity/value-object/service/ports が存在し、tasks領域で利用中 | [packages/domain/src/](https://github.com/TommyKammy/atlaspm/tree/main/packages/domain/src) |
| 層間依存関係の一貫性不足 | tasks以外の多くのユースケースではPrisma直接依存が中心 | apps/core-api/src |
| Turborepo未導入 | ビルドキャッシュや並列実行の最適化がない | - |

### 改善提案

| 優先度 | 提案 | 期待効果 |
|--------|------|---------|
| 🟠 P1 | ドメイン層の横展開（既存実装の適用範囲拡大） | モジュール間の設計一貫性向上、テスト容易性向上 |
| 🟡 P1 | マルチステージDockerビルド導入 | イメージサイズ50%削減 |
| 🟢 P2 | Turborepo導入 | ビルド時間短縮、CI/CD高速化 |

---

## 2. セキュリティポスチャ

| 項目 | 評価 | 概要 |
|------|------|------|
| 認証 | 中 | OIDC/JWT実装は良好だがDevモードのリスクが大きい |
| 認可 | 強 | ロールベースアクセス制御が適切に実装 |
| データ保護 | 中 | SQLインジェクション対策あり、ログ出力に課題 |

### セキュリティリスクマトリックス

| レベル | 件数 | 主な問題 |
|--------|------|----------|
| 🔴 **Critical** | 3件 | Dev認証エンドポイント無保護、フォールバック値、機密情報ログ出力 |
| 🟠 **High** | 3件 | CORS全許可、JWTシークレットフォールバック |
| 🟡 **Medium** | 3件 | Devモードリスク、デフォルトシークレット |
| 🟢 **Low** | 2件 | クエリログ、Swagger公開 |

### Critical脆弱性詳細

| # | 脆弱性 | コード参照 |
|---|--------|-----------|
| 1 | Dev認証エンドポイントに認可チェックなし（誰でも任意のユーザーとしてトークン発行可能） | [dev-auth.controller.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/dev-auth.controller.ts) |
| 2 | DEV_AUTH_SECRETにフォールバック値 'dev-secret' | [auth.service.ts#L22](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/auth.service.ts#L22) |
| 3 | エラーログにリクエストボディ全体を出力（機密情報漏洩リスク） | [error.filter.ts#L47](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/common/error.filter.ts#L47) |

### 対策優先リスト

**即座に対応:**
1. Dev認証エンドポイントにIP制限または削除
2. すべてのフォールバック値を削除
3. ログ出力の機密情報マスキング

**短期間で対応:**
4. CORS設定の厳格化（[main.ts#L22](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/main.ts#L22)）
5. 環境変数の検証強化

---

## 3. コード品質評価

| 評価項目 | スコア | 評価 |
|---------|-------|------|
| TypeScriptの厳格性 | 7/10 | ベースは厳格だが、core-apiで一部緩和 |
| NestJSモジュール構造 | 6/10 | モジュール化はあるが、肥大化したコントローラー存在 |
| Prismaスキーマ設計 | 8/10 | 包括的でインデックスも適切 |
| エラーハンドリング戦略 | 7/10 | グローバルフィルター実装済みだが型安全性に課題 |
| コード重複度（DRY原則） | 5/10 | 巨大コントローラー、重複ロジックの疑い |
| コメント品質・ドキュメント化 | 4/10 | 共有型パッケージが未発達、コメント不足 |

**総合スコア: 37/60 (61.7%)**

### 技術的負債リスト

#### 🔴 Critical（優先度：最高）

| # | 問題 | コード参照 |
|---|------|-----------|
| 1 | tasks.controller.ts の肥大化 (2,454行、81.4KB) | [tasks.controller.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/tasks/tasks.controller.ts) |
| 2 | 欠落しているService層（tasks.service.tsが存在せず、コントローラーに直接Prismaロジック） | - |

#### 🟠 Major（優先度：高）

| # | 問題 | コード参照 |
|---|------|-----------|
| 3 | TypeScript厳格性の緩和 (`strictPropertyInitialization: false`) | [apps/core-api/tsconfig.json](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/tsconfig.json) |
| 4 | 未発達の共有型パッケージ (12行のみ) | [packages/shared-types/src/index.ts](https://github.com/TommyKammy/atlaspm/blob/main/packages/shared-types/src/index.ts) |
| 5 | domainパッケージの適用範囲が限定的（tasks領域中心） | [packages/domain/src/](https://github.com/TommyKammy/atlaspm/tree/main/packages/domain/src) |

---

## 4. フロントエンド評価

### UI層の完成度: **78%**

| 評価項目 | スコア |
|---------|-------|
| Next.js App Routerの適切な使用 | **8.5/10** |
| shadcn/uiコンポーネントのカスタマイズ性 | **7.5/10** |
| リアルタイム協調機能(Yjs/Hocuspocus)の統合品質 | **8/10** |
| 状態管理（サーバー/クライアント状態の分離） | **8/10** |
| レスポンシブ設計とアクセシビリティ（a11y） | **7/10** |
| 機能フラグの実装パターン | **8.5/10** |
| APIクライアント層の抽象化（型安全性） | **8/10** |

**平均スコア: 7.9/10**

### 主要コード参照

| ファイル | GitHub URL |
|---------|-----------|
| Next.js設定 | [next.config.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/web-ui/next.config.ts) |
| App Router構造 | [src/app/](https://github.com/TommyKammy/atlaspm/tree/main/apps/web-ui/src/app) |
| shadcn/ui | [components/ui/](https://github.com/TommyKammy/atlaspm/tree/main/apps/web-ui/src/components/ui) |
| Yjs/Hocusp統合 | [TaskDescriptionEditor.tsx](https://github.com/TommyKammy/atlaspm/blob/main/apps/web-ui/src/components/editor/TaskDescriptionEditor.tsx) |
| 機能フラグ | [feature-flags.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/web-ui/src/lib/feature-flags.ts) |
| APIクライアント | [api.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/web-ui/src/lib/api.ts) |

### UX改善提案

1. **単体テストの導入**（現状未設定）
2. **アクセシビリティの強化**（ARIA属性、キーボードナビゲーション）
3. **next.config.tsの最適化**（画像設定、ISR/SSG戦略）

---

## 5. テスト戦略評価

| 評価項目 | スコア | 備考 |
|---------|-------|------|
| ユニットテストカバレッジ | **4/10** | core-apiのみ3ファイル、web-uiなし |
| E2Eテスト網羅性 | **8/10** | 18スペックファイル、クリティカルパス良好 |
| テストデータセットアップ | **5/10** | seed.ts存在するもfixture不足 |
| モック戦略 | **3/10** | 専用モックディレクトリなし |
| CI/CDパイプライン | **8/10** | GitHub Actions充実、DoDゲート有り |
| ローカル開発環境再現性 | **7/10** | Docker Compose設定あり |

**総合スコア: 35/60 (58%)**

### 主要ファイル参照

| ファイル | GitHub URL |
|---------|-----------|
| CI設定 | [ci.yml](https://github.com/TommyKammy/atlaspm/blob/main/.github/workflows/ci.yml) |
| Vitest設定 | [vitest.config.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/vitest.config.ts) |
| Playwright設定 | [playwright.config.ts](https://github.com/TommyKammy/atlaspm/blob/main/e2e/playwright/playwright.config.ts) |
| E2Eテスト一覧 | [e2e/playwright/tests/](https://github.com/TommyKammy/atlaspm/tree/main/e2e/playwright/tests) |

### 高優先度Gap

1. **web-uiユニットテスト欠如**: Vitest設定ファイル不在
2. **カバレッジ監視なし**: 閾値設定なし
3. **モック戦略不完全**: MSW等未導入

---

## 6. 機能実装マトリックス（Asana比較）

### MVP完了率: **約75%**

### 実装済み主要機能

| カテゴリ | 機能 | 状態 | 品質評価 |
|----------|------|------|---------|
| **コア機能** | ワークスペース/プロジェクト/タスクのCRUD | ✅ 実装済 | 高 |
| | サブタスク（5階層まで） | ✅ 実装済 | 高 |
| | タスク依存関係（循環検出付き） | ✅ 実装済 | 高 |
| **権限管理** | ワークスペース/プロジェクト両レベルのRBAC | ✅ 実装済 | 高 |
| | OIDC/JWT認証 | ✅ 実装済 | 中 |
| **タスク属性** | ステータス、優先度、期限 | ✅ 実装済 | 高 |
| | 進捗率、見積/実績時間 | ✅ 実装済 | 高 |
| | リマインダー | ✅ 実装済 | 中 |
| **ビュー** | リストビュー | ✅ 実装済 | 高 |
| | カンバンビュー | ✅ 実装済 | 高 |
| | タイムラインビュー | ⚠️ 機能フラグ制御 | 中 |
| | カレンダービュー | ❌ 未実装 | - |
| **カスタムフィールド** | TEXT/NUMBER/DATE/SELECT/BOOLEAN | ✅ 実装済 | 高 |
| **ルールエンジン** | トリガー/条件/アクション | ✅ 実装済 | 中 |
| | AND/OR条件 | ✅ 実装済 | 中 |
| **協調機能** | Hocuspocus(Yjs)リアルタイム編集 | ✅ 実装済 | 高 |
| | コメント、メンション | ✅ 実装済 | 高 |
| | 通知システム | ✅ 実装済 | 中 |
| **追加機能** | ファイル添付 | ✅ 実装済 | 高 |
| | 検索 | ✅ 実装済 | 中 |
| | ダッシュボード | ✅ 実装済 | 中 |
| | ポートフォリオ | ✅ 実装済 | 中 |

### 機能フラグ状態

| フラグ | デフォルト | 機能 |
|--------|-----------|------|
| `NEXT_PUBLIC_COLLAB_ENABLED` | false | リアルタイム編集 |
| `NEXT_PUBLIC_TIMELINE_ENABLED` | false | タイムラインビュー |
| `NEXT_PUBLIC_COLLAB_DEV_MODE` | false | コラボ開発モード |

---

## 7. 改善ロードマップ

### Week 1-2: クリティカルセキュリティ修正

| 優先度 | タスク | 担当 |
|--------|--------|------|
| P0 | Dev認証エンドポイントの無効化またはIP制限導入 | セキュリティ |
| P0 | すべてのフォールバック値を削除 | セキュリティ |
| P0 | ログ出力の機密情報マスキング | セキュリティ |

### Month 1: コア機能の完成（MVPリリース基準）

| 優先度 | タスク | 担当 |
|--------|--------|------|
| P1 | ドメイン層の横展開（主要ユースケースへ適用拡大） | アーキテクチャ |
| P1 | tasks.controller.tsのリファクタリング | コード品質 |
| P1 | web-uiにVitest導入 | テスト |
| P2 | カレンダービュー実装 | 機能 |

### Month 2-3: ルールエンジンの拡充

| 優先度 | タスク | 担当 |
|--------|--------|------|
| P2 | 高度なルールトリガー/アクション追加 | 機能 |
| P2 | 依存関係自動リスケジュール | 機能 |
| P2 | Turborepo導入 | アーキテクチャ |

### Month 4+: スケーラビリティ最適化

| 優先度 | タスク | 担当 |
|--------|--------|------|
| P3 | マルチステージDockerビルド | インフラ |
| P3 | キャッシュ戦略最適化 | パフォーマンス |
| P3 | 水平スケーリング対応 | インフラ |

---

## 8. 結論

AtlasPMはエンタープライズ内部向けプロジェクト管理ツールとして、**MVP水準を達成**しています。以下の強みと課題があります：

### 強み

1. **先進的な技術スタック**: NestJS + Prisma + PostgreSQL + Next.js + Yjs
2. **ヘッドレス設計**: API/UIの分離により、将来の拡張性を確保
3. **充実した協調機能**: Yjs/Hocuspocusによるリアルタイム編集
4. **包括的な機能セット**: タスク管理、カスタムフィールド、ルールエンジン
5. **適切なRBAC実装**: ワークスペース/プロジェクト両レベルの権限管理

### 課題

1. **Criticalセキュリティリスク**: Dev認証エンドポイントの無保護
2. **ドメイン層は部分適用**: tasks領域中心で、横断的な適用は未完了
3. **コード品質**: 肥大化したコントローラー、不足する単体テスト

### 推奨アクション

**即座に対応すべき項目:**
1. Dev認証エンドポイントの無効化
2. ログ出力の機密情報マスキング
3. 既存domain実装を他ユースケースへ横展開

**推奨総合評価**: 現状のままではエンタープライズ運用に耐えられない。Criticalセキュリティリスクを修正後、MVPとしてリリース可能。

---

## 9. DDD適用判定（レポート横断基準）

| 判定項目 | 判定 | 根拠 |
|---------|------|------|
| ドメインエンティティ/値オブジェクト | ✅ | `packages/domain/src/entities`, `value-objects` |
| ドメインサービス | ✅ | `packages/domain/src/services/complete-task-lifecycle.ts` |
| ポート経由の依存分離 | ✅ | `packages/domain/src/ports/*` |
| core-apiからの実利用 | ✅ | `apps/core-api/src/tasks/tasks.controller.ts` |
| 主要ユースケースへの横断適用 | ❌ | 現状はtasks領域中心 |

**判定**: 部分適用（5項目中4項目達成）

## 10. 計測メタデータ（再計測用）

- 対象コミットSHA: `656f6d7135348ca7d6d4dc76eed5afd0e22c7463`
- 計測日時: `2026-03-04 21:44:05 JST (+0900)`
- 本レポートの数値系主張は上記SHA時点の内容に基づく
- 計測コマンド:
  - `find e2e/playwright/tests -type f -name '*.spec.ts' | wc -l`
  - `wc -l e2e/playwright/tests/*.spec.ts | tail -n 1`

*本レポートは6つの専門エージェントによる並行調査に基づく統合分析結果です。*
