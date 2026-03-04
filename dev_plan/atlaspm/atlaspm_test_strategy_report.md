# AtlasPM テスト戦略・品質保証評価レポート

## リポジトリ概要
- **リポジトリ**: https://github.com/TommyKammy/atlaspm
- **プロジェクト**: AtlasPM - ヘッドレス・ルール駆動型プロジェクト管理コア
- **構造**: Monorepo (pnpm workspace)
  - apps/core-api: NestJS + Prisma + PostgreSQL
  - apps/web-ui: Next.js + Tailwind + shadcn/ui
  - apps/collab-server: Hocuspocus (Yjs) リアルタイム協調サーバー
  - e2e/playwright: E2Eテスト

---

## 評価スコア（10点満点）

| 評価項目 | スコア | 備考 |
|---------|-------|------|
| 1. ユニットテストカバレッジ | **4/10** | core-apiのみ3ファイル、web-uiなし |
| 2. E2Eテスト網羅性 | **8/10** | 18スペックファイル、クリティカルパス良好 |
| 3. テストデータセットアップ | **5/10** | seed.ts存在するも内容未確認 |
| 4. モック戦略 | **3/10** | 専用モックディレクトリなし |
| 5. CI/CDパイプライン | **8/10** | GitHub Actions充実、DoDゲート有り |
| 6. ローカル開発環境再現性 | **7/10** | Docker Compose設定あり |

**総合スコア: 35/60 (58%)**

---

## 1. ユニットテストカバレッジ評価（4/10）

### 現状
- **テストフレームワーク**: Vitest (v2.1.8)
- **設定ファイル**: `apps/core-api/vitest.config.ts`
  - https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/vitest.config.ts

```typescript
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
```

### テストファイル一覧（3ファイルのみ）
| ファイル | 行数 | 内容 |
|---------|------|------|
| `core.integration.test.ts` | 2,660行 | 統合テスト（メイン） |
| `custom-field.validation.test.ts` | 未確認 | カスタムフィールド検証 |
| `rule-definition.test.ts` | 未確認 | ルール定義テスト |

- https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/test/core.integration.test.ts
- https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/test/custom-field.validation.test.ts
- https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/test/rule-definition.test.ts

### 問題点
- **web-uiにユニットテストなし**: Vitest設定ファイル不在
- **カバレッジ設定なし**: 閾値未設定
- **モジュール単位テスト不足**: src/配下20+モジュールに対しテスト3ファイルのみ

### 改善提案
1. web-uiにVitest設定追加
2. カバレッジ閾値設定（80%目標）
3. 各モジュールに単体テスト追加（Service/Controller単位）

---

## 2. E2Eテスト(Playwright)網羅性（8/10）

### 現状
- **設定ファイル**: `e2e/playwright/playwright.config.ts`
  - https://github.com/TommyKammy/atlaspm/blob/main/e2e/playwright/playwright.config.ts

```typescript
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  retries: process.env.CI ? 3 : 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  workers: 1,
});
```

### E2Eテストファイル一覧（18ファイル）
| ファイル | 目的 |
|---------|------|
| `admin.spec.ts` | 管理者機能 |
| `collab.spec.ts` | リアルタイム協調 |
| `custom-fields-filter.spec.ts` | カスタムフィールドフィルタリング |
| `dashboards.spec.ts` | ダッシュボード |
| `dependencies.spec.ts` | タスク依存関係 |
| `mvp.spec.ts` | メインユーザーフロー（634行） |
| `my-tasks.spec.ts` | マイタスク機能 |
| `p0-regression-smoke.spec.ts` | P0回帰スモークテスト |
| `portfolios.spec.ts` | ポートフォリオ |
| `rules.spec.ts` | ルール機能 |
| `search.spec.ts` | 検索機能 |
| `slack.spec.ts` | Slack連携 |
| `subtasks.spec.ts` | サブタスク |
| `timeline-drag-reschedule.spec.ts` | タイムラインD&D |
| `timeline-reschedule-conflict.spec.ts` | リスケジュール競合 |
| `timeline-route.spec.ts` | タイムラインルーティング |
| `timeline.spec.ts` | タイムライン機能 |
| `workload.spec.ts` | ワークロード |

- https://github.com/TommyKammy/atlaspm/tree/main/e2e/playwright/tests

### 強み
- クリティカルパスカバー: プロジェクト作成→タスク管理→依存関係→タイムライン
- P0回帰テストあり: 重要機能の安定性確保
- リトライ設定: CI環境で3回リトライ
- トレース/スクリーンショット/ビデオ保存

### 改善提案
1. 並列実行設定（workers: 1 → 3-4）
2. visual regressionテスト追加
3. API mocking導入（外部サービス切り離し）

---

## 3. テストデータセットアップ（5/10）

### 現状
- **Seedファイル**: `apps/core-api/prisma/seed.ts`
  - https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/prisma/seed.ts
- **スクリプト**: `db:seed`: `tsx prisma/seed.ts`

### Prisma設定
- **スキーマ**: `apps/core-api/prisma/schema.prisma`
  - https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/prisma/schema.prisma
- **マイグレーション**: `apps/core-api/prisma/migrations/`

### 問題点
- seed.tsの内容詳細未確認（タイムアウト）
- E2Eテスト用fixtureが最小限（pixel.pngのみ）
- テストデータファクトリパターン未導入

### 改善提案
1. seed.tsに多様なテストデータシナリオ追加
2. Factoryパターン導入（@faker-js/faker活用）
3. E2E用fixture拡充

---

## 4. モック戦略（3/10）

### 現状
- **専用モックディレクトリなし**
- **統合テストでのモック例**:
```typescript
// core.integration.test.ts
process.env.REMINDER_WORKER_ENABLED = 'false';
process.env.TASK_RETENTION_WORKER_ENABLED = 'false';
process.env.WEBHOOK_DELIVERY_WORKER_ENABLED = 'false';
```

### 問題点
- 外部サービス（Slack/Algolia）のモック戦略不明確
- テストで実際のAPIコール可能性
- モックサーバー（MSW等）未導入

### 改善提案
1. MSW (Mock Service Worker) 導入
2. 外部サービス用モックアダプター作成
3. 契約テスト（Pact）検討

---

## 5. CI/CDパイプライン（8/10）

### 現状
- **設定ファイル**: `.github/workflows/ci.yml`
  - https://github.com/TommyKammy/atlaspm/blob/main/.github/workflows/ci.yml

### ワークフロー構成
```yaml
jobs:
  type-check:    # TypeScript型チェック
  lint:          # ESLint
  test:          # ユニットテスト（PostgreSQLサービス）
  build:         # ビルド（needs: type-check, lint）
  e2e:           # E2Eテスト（needs: build, test）
    timeout-minutes: 45
```

### 強み
- **DoDゲート**: `verify:ci` スクリプト
- **並列実行**: type-check + lint → build → e2e
- **アーティファクト保存**: Playwright結果
- **PostgreSQLサービス**: テスト用DB

### 改善提案
1. カバレッジレポート自動生成
2. セキュリティスキャン（Snyk/Trivy）追加
3. パフォーマンステスト追加

---

## 6. ローカル開発環境再現性（7/10）

### 現状
- **E2E起動スクリプト**: `scripts/run-e2e.sh`
  - https://github.com/TommyKammy/atlaspm/blob/main/scripts/run-e2e.sh
- **E2E環境起動**: `scripts/e2e-up.sh`
  - https://github.com/TommyKammy/atlaspm/blob/main/scripts/e2e-up.sh

### Docker Compose構成
```bash
docker compose up -d postgres core-api collab-server web-ui
```

### サービス待機機構
```bash
wait_for_url "http://localhost:3001/docs" "core-api"
wait_for_url "http://localhost:3000/login" "web-ui"
```

### スクリプト一覧
| スクリプト | 用途 |
|-----------|------|
| `e2e-up.sh` | E2E環境起動 |
| `e2e-down.sh` | E2E環境停止 |
| `run-e2e.sh` | 完全E2E実行 |
| `e2e-stability.sh` | 安定性テスト |
| `e2e-rebuild` | リビルド実行 |

### 改善提案
1. docker-compose.dev.yml追加（ホットリロード対応）
2. devcontainer設定追加
3. 環境変数検証スクリプト追加

---

## テストGap Analysis

### 高優先度Gap
1. **web-uiユニットテスト欠如**: フロントエンド品質リスク
2. **カバレッジ監視なし**: 品質低下の検知遅れ
3. **モック戦略不完全**: 外部依存によるテスト不安定化

### 中優先度Gap
1. **API契約テストなし**: フロント/バック連携リスク
2. **ビジュアルリグレッションなし**: UI変更検知漏れ
3. **パフォーマンステストなし**: スケーラビリティ不明

### 低優先度Gap
1. **負荷テストなし**: 高負荷時の挙動不明
2. **セキュリティテストなし**: 脆弱性検知漏れ
3. **アクセシビリティテストなし**: a11y準拠不明

---

## 品質ゲート設計案

### 推奨品質ゲート構成

```yaml
# 提案: .github/workflows/quality-gates.yml
name: Quality Gates

on:
  pull_request:
    branches: [main, develop]

jobs:
  # Gate 1: 静的解析
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm audit --audit-level moderate

  # Gate 2: ユニットテスト（カバレッジ閾値）
  unit-test:
    runs-on: ubuntu-latest
    needs: static-analysis
    steps:
      - run: pnpm test --coverage
      - uses: codecov/codecov-action@v4
        with:
          fail_ci_if_error: true
          thresholds:
            lines: 80%
            functions: 80%

  # Gate 3: 統合テスト
  integration-test:
    runs-on: ubuntu-latest
    needs: unit-test
    services:
      postgres:
        image: postgres:16
    steps:
      - run: pnpm --filter @atlaspm/core-api test:integration

  # Gate 4: E2Eテスト
  e2e-test:
    runs-on: ubuntu-latest
    needs: integration-test
    steps:
      - run: pnpm e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright/test-results

  # Gate 5: ビルド検証
  build-verification:
    runs-on: ubuntu-latest
    needs: e2e-test
    steps:
      - run: pnpm build
      - run: docker compose build
```

### カバレッジ閾値提案

| レベル | ラインカバレッジ | 関数カバレッジ | 適用対象 |
|-------|-----------------|---------------|---------|
| 必須 | 80% | 80% | core-api |
| 推奨 | 70% | 70% | web-ui |
| 許容 | 60% | 60% | collab-server |

---

## 具体的な改善提案（優先順位付き）

### P0（即座に対応）
1. **web-uiにVitest導入**
   ```bash
   cd apps/web-ui
   pnpm add -D vitest @vitest/coverage-v8
   ```

2. **カバレッジ設定追加**
   ```typescript
   // vitest.config.ts
   export default defineConfig({
     test: {
       coverage: {
         provider: 'v8',
         thresholds: {
           lines: 80,
           functions: 80,
         },
       },
     },
   });
   ```

### P1（1-2週間）
3. **MSW導入**（APIモック）
4. **Factoryパターン導入**（テストデータ生成）
5. **並列E2E実行設定**

### P2（1ヶ月）
6. **ビジュアルリグレッションテスト**（Chromatic/Playwright）
7. **API契約テスト**（Pact）
8. **パフォーマンステスト**（k6）

---

## まとめ

AtlasPMリポジトリはE2EテストとCI/CDパイプラインが充実しており、主要なクリティカルパスはカバーされています。しかし、ユニットテストカバレッジとモック戦略に改善の余地があります。特にweb-uiのテスト欠如は品質リスクとなるため、優先的に対応することを推奨します。

## 計測メタデータ（再計測用）

- 対象コミットSHA: `656f6d7135348ca7d6d4dc76eed5afd0e22c7463`
- 計測日時: `2026-03-04 21:44:05 JST (+0900)`
- 本レポートの数値系主張は上記SHA時点の内容に基づく
- 計測コマンド:
  - `find e2e/playwright/tests -type f -name '*.spec.ts' | wc -l`
  - `wc -l e2e/playwright/tests/*.spec.ts | tail -n 1`

### 主要ファイル参照一覧

| ファイル | URL |
|---------|-----|
| CI設定 | https://github.com/TommyKammy/atlaspm/blob/main/.github/workflows/ci.yml |
| Vitest設定 | https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/vitest.config.ts |
| Playwright設定 | https://github.com/TommyKammy/atlaspm/blob/main/e2e/playwright/playwright.config.ts |
| 統合テスト | https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/test/core.integration.test.ts |
| E2Eテスト一覧 | https://github.com/TommyKammy/atlaspm/tree/main/e2e/playwright/tests |
| Seedファイル | https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/prisma/seed.ts |
| E2E実行スクリプト | https://github.com/TommyKammy/atlaspm/blob/main/scripts/run-e2e.sh |
| ルートpackage.json | https://github.com/TommyKammy/atlaspm/blob/main/package.json |
| core-api package.json | https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/package.json |
