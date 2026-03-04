# AtlasPM コード品質・技術的負債分析レポート

## リポジトリ概要
- **リポジトリ**: https://github.com/TommyKammy/atlaspm
- **プロジェクト**: AtlasPM - ヘッドレス・ルール駆動型プロジェクト管理コア
- **技術スタック**: NestJS + Prisma + PostgreSQL (core-api), Next.js (web-ui)

---

## 品質スコア（各観点10点満点）

| 評価項目 | スコア | 評価 |
|---------|-------|------|
| TypeScriptの厳格性 | 7/10 | ベースは厳格だが、core-apiで一部緩和 |
| NestJSモジュール構造 | 6/10 | モジュール化はあるが、肥大化したコントローラー存在 |
| Prismaスキーマ設計 | 8/10 | 包括的でインデックスも適切 |
| エラーハンドリング戦略 | 7/10 | グローバルフィルター実装済みだが型安全性に課題 |
| コード重複度（DRY原則） | 5/10 | 巨大コントローラー、重複ロジックの疑い |
| コメント品質・ドキュメント化 | 4/10 | 共有型パッケージが未発達、コメント不足 |

**総合スコア: 37/60 (61.7%)**

---

## 技術的負債リスト

### 🔴 Critical（優先度：最高）

#### 1. tasks.controller.ts の肥大化
- **場所**: `apps/core-api/src/tasks/tasks.controller.ts`
- **問題**: 2,454行、81.4KBの巨大コントローラー
- **GitHub URL**: https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/tasks/tasks.controller.ts
- **影響**: メンテナンス性低下、テスト困難、単一責任原則違反
- **推奨対応**: 
  - サービス層へのビジネスロジック移動
  - 機能別にコントローラー分割（TaskController, TaskCommentController, etc.）

#### 2. 欠落しているService層
- **場所**: `apps/core-api/src/tasks/`
- **問題**: tasks.service.tsが存在せず、コントローラーに直接Prismaロジック
- **影響**: コード重複、テスト困難、関心事の混在
- **推奨対応**: Service層の導入、ビジネスロジックの分離

---

### 🟠 Major（優先度：高）

#### 3. TypeScript厳格性の緩和
- **場所**: `apps/core-api/tsconfig.json`
- **問題**: 
  ```json
  "strictPropertyInitialization": false,
  "exactOptionalPropertyTypes": false
  ```
- **GitHub URL**: https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/tsconfig.json
- **影響**: 型安全性低下、潜在的なランタイムエラー
- **推奨対応**: 両方のオプションをtrueに設定し、エラーを修正

#### 4. 未発達の共有型パッケージ
- **場所**: `packages/shared-types/src/index.ts`
- **問題**: 12行のみ、Prismaスキーマと重複・不一致の可能性
- **GitHub URL**: https://github.com/TommyKammy/atlaspm/blob/main/packages/shared-types/src/index.ts
- **内容**:
  ```typescript
  export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER';
  ```
- **影響**: 型の重複、一貫性欠如、メンテナンス負担
- **推奨対応**: Prismaクライアントから型を再エクスポート、または自動生成

#### 5. domainパッケージの適用範囲が限定的
- **場所**: `packages/domain/`, `apps/core-api/src/tasks/`
- **問題**: domainパッケージ自体は実装済みだが、現状はタスクライフサイクル周辺への適用が中心で、他モジュールへの展開が限定的
- **GitHub URL**:
  - https://github.com/TommyKammy/atlaspm/blob/main/packages/domain/src/services/complete-task-lifecycle.ts
  - https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/tasks/tasks.controller.ts
- **影響**: DDD適用度のばらつきにより、モジュール間で設計・テスト戦略が不統一になりやすい
- **推奨対応**: 影響の大きい業務ルールから順にdomain層へ移管し、適用対象を段階的に拡大

#### 6. エラーフィルターの型安全性改善
- **場所**: `apps/core-api/src/common/error.filter.ts`
- **問題**: `exception: unknown`の扱いにanyキャストの疑い
- **GitHub URL**: https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/common/error.filter.ts
- **内容**:
  ```typescript
  const body = exception.getResponse();
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message?: string }).message ?? exception.message
      : exception.message;
  ```
- **推奨対応**: 型ガード関数の導入、カスタム例外クラスの整備

---

### 🟡 Minor（優先度：中）

#### 7. コメント・ドキュメント不足
- **問題**: 複雑なビジネスロジックにJSDocコメントが不足
- **推奨対応**: 公開APIにJSDoc追加、複雑なロジックにインラインコメント

#### 8. AppModuleの肥大化
- **場所**: `apps/core-api/src/app.module.ts`
- **問題**: 18個のコントローラー、多数のプロバイダー
- **GitHub URL**: https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/app.module.ts
- **推奨対応**: 機能モジュールへの分割検討

#### 9. Webhook配信信頼性の継続改善余地
- **場所**: `apps/core-api/src/webhooks/`
- **現状**: Webhookエンドポイントは実装済み（`POST /webhooks`, `GET /webhooks/dlq`, `POST /webhooks/dlq/:eventId/retry`）
- **問題**: エンドポイント未実装ではなく、運用観点では再送戦略・監視/アラート・配信SLO整備の余地がある
- **推奨対応**: 配信失敗率・再送回数・DLQ滞留時間の可観測性を強化し、SLOを定義

---

## リファクタリング優先順位

### Phase 1（即座に対応）
1. **tasks.controller.tsの分割** - ビジネスロジックをService層へ移動
2. **TypeScript厳格性の復活** - `strictPropertyInitialization`と`exactOptionalPropertyTypes`を有効化

### Phase 2（短期対応）
3. **shared-typesパッケージの整備** - Prisma型の再エクスポート
4. **domainパッケージの活用または削除** - 明確な責任範囲の定義
5. **エラーハンドリングの強化** - 型安全な例外処理

### Phase 3（中期対応）
6. **モジュール構造の見直し** - 機能別モジュール分割
7. **ドキュメント整備** - JSDoc、APIドキュメント

---

## 良いプラクティス（評価ポイント）

### ✅ Prismaスキーマ設計
- 適切なインデックス設定（@@index）
- 命名規則の一貫性（@map使用）
- リレーション設計の適切性
- ソフトデリート対応（deletedAt）

### ✅ エラーハンドリング基盤
- GlobalErrorFilterの実装
- CorrelationIdによるトレーサビリティ
- 構造化ログ出力

### ✅ 依存性注入
- NestJSのDIパターン適切な使用
- ガードによる認可制御

### ✅ ベースTypeScript設定
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

---

## まとめ

AtlasPMは機能的には充実したプロジェクト管理システムですが、コード品質において以下の課題があります：

1. **肥大化したコントローラー**がメンテナンス性を著しく低下させている
2. **Service層の欠如**がビジネスロジックの分離を妨げている
3. **共有型パッケージの未発達**が型の一貫性を損なっている
4. **TypeScript厳格性の緩和**が型安全性を低下させている

これらの課題に対処することで、長期的な保守性と開発速度の向上が期待できます。

---

## 検証メタデータ

- 対象コミットSHA: `656f6d7135348ca7d6d4dc76eed5afd0e22c7463`
- 計測/確認日時: `2026-03-04 21:44:05 JST (+0900)`
- 本レポートの数値・評価主張は上記SHA時点の状態に基づく
