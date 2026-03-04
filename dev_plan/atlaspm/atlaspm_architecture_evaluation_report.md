# AtlasPM リポジトリ アーキテクチャ評価レポート

## 概要

**評価対象リポジトリ**: https://github.com/TommyKammy/atlaspm  
**評価日**: 2026年3月4日  
**評価者**: システムアーキテクトAI  
**総合評価**: B- (改善の余地あり)

---

## 評価項目別スコア

| 評価項目 | スコア (10点満点) | 評価 |
|---------|------------------|------|
| 1. モノレポ構成 | 7/10 | B |
| 2. クリーンアーキテクチャ/DDD遵守度 | 6/10 | C |
| 3. 層間依存関係 | 6/10 | C+ |
| 4. マイクロサービス境界 | 8/10 | B+ |
| 5. スケーラビリティ設計 | 6/10 | C+ |

**総合スコア**: 33/50 (66%)

---

## 詳細分析

### 1. モノレポ構成（Turborepo/pnpm workspace）の設定適切性 【7/10】

#### 良い点
- **pnpm-workspace.yaml**: 適切に設定されている
  - `apps/*`, `packages/*`, `e2e/playwright` を含む
  - 標準的なモノレポ構造に従っている
  - 参照: https://github.com/TommyKammy/atlaspm/blob/main/pnpm-workspace.yaml

- **package.json (root)**: 適切な設定
  - `packageManager`: "pnpm@9.15.4" で固定
  - `engines`: Node.js >=20.0.0 <21.0.0, pnpm >=9.0.0 <10.0.0
  - セキュリティオーバーライド: lodash, js-yaml
  - 参照: https://github.com/TommyKammy/atlaspm/blob/main/package.json

- **tsconfig.base.json**: 厳密なTypeScript設定
  - `strict: true`, `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true`
  - 参照: https://github.com/TommyKammy/atlaspm/blob/main/tsconfig.base.json

#### 改善点
- **Turborepo未使用**: キャッシュやパイプライン最適化のためTurborepo導入を検討
- **ワークスペースフィルター**: `--filter` 使用だが、依存グラフの明示的定義がない

---

### 2. クリーンアーキテクチャ/ドメイン駆動設計（DDD）の遵守度 【6/10】

#### 判定チェックリスト（DDD適用）
| 判定項目 | 判定 | 根拠 |
|---------|------|------|
| ドメインエンティティ/値オブジェクトが存在する | ✅ | `packages/domain/src/entities/task.ts`, `value-objects/*` |
| ドメインサービスが存在する | ✅ | `services/complete-task-lifecycle.ts` |
| ドメイン層がインフラ実装へ直接依存しない | ✅ | リポジトリ/UnitOfWorkは `ports` 経由 |
| アプリケーション層でドメインを利用している | ✅ | `apps/core-api/src/tasks/tasks.controller.ts` で `completeTaskLifecycle` を使用 |
| 主要ユースケースに横断適用されている | ❌ | 適用はタスクライフサイクル周辺が中心 |

**判定結果**: 5項目中4項目達成（部分適用）

#### 良い点
- **domainパッケージの実装が進展**:
  - エンティティ、値オブジェクト、ドメインサービス、ポート、ドメインエラーを実装
  - 参照: https://github.com/TommyKammy/atlaspm/tree/main/packages/domain/src
- **core-apiでの実利用**:
  - task lifecycle更新処理で `@atlaspm/domain` を利用
  - 参照: https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/tasks/tasks.controller.ts
- **機能別モジュール分割**:
  - tasks, projects, workspaces, rules など機能ごとに分離

#### 改善点
- **適用範囲の偏り**:
  - DDDの適用は現状タスク領域中心で、他モジュールへの展開が限定的
- **NestJS構造との責務境界が不均一**:
  - 一部ロジックは依然としてControllerに集中

---

### 3. 層間の依存関係の方向性（ドメイン層の独立性確認）【6/10】

#### 依存関係分析

```
core-api dependencies:
├── @atlaspm/shared-types: workspace:*  ✓
├── @atlaspm/domain: workspace:*  ✓（tasks領域で参照）
├── @nestjs/*: フレームワーク依存
├── @prisma/client: ORM依存
└── ...

web-ui dependencies:
├── @atlaspm/shared-types: workspace:*  ✓
└── @atlaspm/domain: ❌ 未参照

collab-server dependencies:
├── @hocuspocus/*: Yjsリアルタイム
└── ワークスペースパッケージ参照なし
```

#### 問題点
- **shared-typesも最小限**:
  - `packages/shared-types/src/index.ts` のみ
  - 型定義が各アプリに分散

- **依存方向の徹底は未完了**:
  - tasks以外の多くのユースケースではcore-apiからPrismaへ直接依存
  - ドメイン層経由の一貫適用には未到達

#### 良い点
- **workspaceプロトコル使用**: `workspace:*` でローカルパッケージ参照

---

### 4. マイクロサービス境界の適切性（API/Collab-Serverの分離）【8/10】

#### 良い点
- **責務の明確な分離**:
  | サービス | 責務 | 技術スタック |
  |---------|------|------------|
  | core-api | REST API, ビジネスロジック | NestJS + Prisma |
  | collab-server | リアルタイム協調編集 | Hocuspocus (Yjs) |
  | web-ui | フロントエンド | Next.js |

- **collab-serverの独立性**:
  - Yjs/Hocuspocus専用サーバーとして適切に分離
  - JWT認証（jose）のみ共有
  - 参照: https://github.com/TommyKammy/atlaspm/blob/main/apps/collab-server/package.json

- **web-uiの適切な技術選定**:
  - @hocuspocus/provider でcollab-serverと連携
  - @tanstack/react-query でcore-apiと連携
  - 参照: https://github.com/TommyKammy/atlaspm/blob/main/apps/web-ui/package.json

#### 改善点
- **共有パッケージの薄弱**: shared-types, domain, rule-engineが未活用
- **API Gatewayなし**: クライアントが複数エンドポイントを直接参照

---

### 5. スケーラビリティ設計（ステートレス性、水平スケーリング可能性）【6/10】

#### 良い点
- **ステートレス設計**:
  - core-api: ステートレスREST API
  - PostgreSQLを外部DBとして使用
  - 環境変数で設定可能

- **Prismaの適切な使用**:
  - コネクションプール管理
  - マイグレーション管理
  - 参照: https://github.com/TommyKammy/atlaspm/tree/main/apps/core-api/prisma

- **Docker対応**:
  - 各アプリにDockerfileあり
  - 参照: https://raw.githubusercontent.com/TommyKammy/atlaspm/main/apps/core-api/Dockerfile

#### 問題点
- **Dockerfileが単一ステージ**:
  ```dockerfile
  # マルチステージビルドではない
  FROM node:20-bookworm-slim
  # ... ビルドと実行が同じステージ
  ```
  - イメージサイズが大きい
  - ビルドキャッシュの効率が悪い

- **collab-serverのスケーリング制限**:
  - Yjsドキュメントがメモリに保持される
  - 水平スケーリング時のドキュメント同期が必要

- **Redis/Session Storeなし**:
  - セッション管理が不明確
  - スケーリング時に共有ストレージが必要

---

## 改善提案（優先順位付き）

### 🔴 P0: ドメイン層の横展開と責務整理

**問題**: packages/domainは実装済みだが、適用範囲が限定されており、ドメインロジックがcore-apiに分散

**提案**:
1. packages/domainの利用を主要ユースケースへ拡大:
   ```
   packages/domain/src/
   ├── entities/          # ドメインエンティティ
   ├── value-objects/     # 値オブジェクト
   ├── repositories/      # リポジトリインターフェース
   ├── services/          # ドメインサービス
   └── events/            # ドメインイベント
   ```

2. core-api側をアプリケーションサービス中心へ整理:
   ```typescript
   // core-apiのServiceはドメイン層を使用
   import { Task, TaskStatus } from '@atlaspm/domain';
   ```

**期待効果**:
- ビジネスロジックの集中管理
- テスト容易性の向上
- フレームワークからの独立性

---

### 🟡 P1: マルチステージDockerビルドの導入

**問題**: Dockerfileが単一ステージでイメージサイズが大きい

**提案**:
```dockerfile
# Build stage
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @atlaspm/core-api build

# Production stage
FROM node:20-bookworm-slim AS production
WORKDIR /app
COPY --from=builder /app/apps/core-api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

**期待効果**:
- イメージサイズの削減（50%以上）
- デプロイ時間の短縮
- セキュリティ向上（ビルドツールを除外）

---

### 🟢 P2: Turborepoの導入とパイプライン最適化

**問題**: ビルドキャッシュや並列実行の最適化がない

**提案**:
1. `turbo.json` の作成:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "pipeline": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**", ".next/**"]
       },
       "test": {
         "dependsOn": ["build"]
       },
       "lint": {}
     }
   }
   ```

2. root package.jsonのscripts変更:
   ```json
   {
     "scripts": {
       "build": "turbo run build",
       "test": "turbo run test",
       "lint": "turbo run lint"
     }
   }
   ```

**期待効果**:
- ビルド時間の短縮（キャッシュ活用）
- 並列実行によるCI/CD高速化
- 依存関係の可視化

---

## まとめ

AtlasPMリポジトリは、モノレポ構成とマイクロサービス分割には一定の水準がありますが、**クリーンアーキテクチャ/DDDの観点からは大きな改善の余地**があります。

### 強み
- 適切なモノレポ構成（pnpm workspace）
- 明確なマイクロサービス境界（API/Collab/UI）
- 厳密なTypeScript設定
- 機能別モジュール分割

### 弱み
- ドメイン層は部分適用で、横断的な適用が未完了
- 層間依存関係が不明確
- Dockerfileの非効率なビルド
- Turborepo未導入によるビルド最適化の欠如

### 推奨アクション
1. **即座に**: ドメイン層の適用範囲を拡大（tasks以外へ横展開）
2. **短期間**: マルチステージDockerビルド導入
3. **中期**: Turborepo導入とCI/CD最適化

---

## 検証メタデータ

- 対象コミットSHA: `656f6d7135348ca7d6d4dc76eed5afd0e22c7463`
- 計測/確認日時: `2026-03-04 21:44:05 JST (+0900)`
- 本レポートの数値・評価主張は上記SHA時点の状態に基づく

---

## 参照リンク

- リポジトリ: https://github.com/TommyKammy/atlaspm
- pnpm-workspace.yaml: https://github.com/TommyKammy/atlaspm/blob/main/pnpm-workspace.yaml
- package.json (root): https://github.com/TommyKammy/atlaspm/blob/main/package.json
- core-api package.json: https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/package.json
- domain package: https://github.com/TommyKammy/atlaspm/tree/main/packages/domain/src
- collab-server package.json: https://github.com/TommyKammy/atlaspm/blob/main/apps/collab-server/package.json
- web-ui package.json: https://github.com/TommyKammy/atlaspm/blob/main/apps/web-ui/package.json
