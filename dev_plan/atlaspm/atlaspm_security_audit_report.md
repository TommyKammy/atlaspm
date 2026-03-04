# AtlasPMリポジトリ セキュリティ監査レポート

## 監査概要
- **対象リポジトリ**: https://github.com/TommyKammy/atlaspm
- **監査日**: 2026年3月4日
- **監査対象**: OIDC/JWT認証、Dev認証モード、コラボレーション機能、API認可、SQLインジェクション対策、CORS設定、機密情報ログ出力

---

## セキュリティリスクマトリックス

### 🔴 Critical（重大）

| ID | 脆弱性 | 影響 | コード参照 |
|----|--------|------|------------|
| C1 | **Dev認証エンドポイントに認可チェックなし** | 誰でも任意のユーザーとしてトークン発行可能 | [dev-auth.controller.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/dev-auth.controller.ts) |
| C2 | **DEV_AUTH_SECRETにフォールバック値あり** | デフォルト値 'dev-secret' で認証回避可能 | [auth.service.ts#L22](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/auth.service.ts) |
| C3 | **エラーログにリクエストボディ全体を出力** | パスワード、トークン等の機密情報がログに残る | [error.filter.ts#L47](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/common/error.filter.ts) |

### 🟠 High（高）

| ID | 脆弱性 | 影響 | コード参照 |
|----|--------|------|------------|
| H1 | **CORS設定がすべてのオリジンを許可** | 設定なしの `enableCors()` は全オリジン許可 | [main.ts#L22](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/main.ts) |
| H2 | **COLLAB_DEV_MODE誤設定時のJWT検証バイパス運用リスク** | `COLLAB_DEV_MODE=true` で起動すると `COLLAB_JWT_SECRET` 未設定でも起動可能になり、本番運用で誤設定リスクが残る | [collab-server/index.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/collab-server/src/index.ts) |
| H3 | **OIDC_JWKS_URIに空文字のフォールバック** | 未設定時にJWKS取得に失敗 | [auth.service.ts#L35](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/auth.service.ts) |

### 🟡 Medium（中）

| ID | 脆弱性 | 影響 | コード参照 |
|----|--------|------|------------|
| M1 | **DEV_AUTH_ENABLEDが環境変数で制御** | 本番環境で誤って有効化されるリスク | [.env.example](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/.env.example) |
| M2 | **.env.exampleに機密情報のデフォルト値あり** | 変更忘れによる弱いシークレット使用 | [.env.example](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/.env.example) |
| M3 | **DevトークンTTLが8時間（長すぎ）** | 開発用でもセッション期間が長い | [auth.service.ts#L48](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/auth.service.ts) |

### 🟢 Low（低）

| ID | 脆弱性 | 影響 | コード参照 |
|----|--------|------|------------|
| L1 | **リクエストログにクエリパラメータを出力** | 機密情報が含まれる可能性 | [request-logging.middleware.ts](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/common/request-logging.middleware.ts) |
| L2 | **Swagger docsが本番環境で有効化される可能性** | API仕様の情報漏洩 | [main.ts#L18](https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/main.ts) |

---

## 対策優先リスト

### 即座に対応（Critical）

1. **Dev認証エンドポイントの保護**
   - IPホワイトリスト制限を追加
   - または、開発環境のみで有効化するビルド時分岐を実装
   ```typescript
   // 推奨: IP制限追加
   if (!isAllowedIP(req.ip)) throw new ForbiddenException();
   ```

2. **フォールバック値の削除と起動ガード**
   - `DEV_AUTH_SECRET`、`OIDC_JWKS_URI` の `??` フォールバックを削除
   - `COLLAB_DEV_MODE` は本番環境で `true` を禁止（起動時ガード）
   - 必須値未設定時はアプリケーション起動時にエラー

3. **ログ出力の機密情報マスキング**
   - エラーログから `req.body` を削除、または機密フィールドをマスク
   ```typescript
   // 推奨: 機密フィールドマスキング
   const sanitizedBody = maskSensitiveFields(req.body);
   ```

### 短期間で対応（High）

4. **CORS設定の厳格化**
   ```typescript
   app.enableCors({
     origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
     credentials: true,
   });
   ```

5. **環境変数の検証強化**
   - アプリケーション起動時に必須環境変数を検証
   - joiやzod等のスキーマ検証を導入

### 中期で対応（Medium/Low）

6. **Dev認証モードの完全削除（本番ビルド時）**
7. **セキュリティヘッダーの追加（helmet）**
8. **レート制限の実装**

---

## セキュリティポスチャ評価

### 認証: **中**
- ✅ OIDC/JWT検証にJWKSを使用
- ✅ トークンのissuer/audience検証
- ❌ Dev認証モードのリスク
- ❌ フォールバック値の存在

### 認可: **強**
- ✅ コントローラーレベルでのAuthGuard適用
- ✅ プロジェクト/ワークスペースロールチェック
- ✅ リソース所有者チェック
- ✅ デコレーターベースのロール要件定義

### データ保護: **中**
- ✅ Prismaのパラメータ化クエリ（SQLインジェクション対策）
- ✅ 入力バリデーション（class-validator）
- ❌ 機密情報のログ出力
- ❌ CORS設定の不備

---

## 具体的な脆弱性箇所のコード参照

### Critical

1. **Dev認証エンドポイント（認可なし）**
   - https://github.com/TommyKammy/atlaspm/blob/main/apps/core-api/src/auth/dev-auth.controller.ts
   - 誰でも `/dev-auth/token` にアクセスして任意のsubでトークン発行可能

2. **DEV_AUTH_SECRETのフォールバック**
   ```typescript
   // auth.service.ts 22行目
   const secret = createSecretKey(Buffer.from(process.env.DEV_AUTH_SECRET ?? 'dev-secret'));
   ```

3. **機密情報ログ出力**
   ```typescript
   // error.filter.ts 47-57行目
   this.logger.error({
     body: req.body,  // ← 機密情報が含まれる
     // ...
   });
   ```

### High

4. **CORS設定なし**
   ```typescript
   // main.ts 22行目
   app.enableCors();  // ← すべてのオリジンを許可
   ```

5. **COLLAB_DEV_MODEに依存した起動条件**
   ```typescript
   // collab-server/index.ts
   const COLLAB_JWT_SECRET = process.env.COLLAB_JWT_SECRET ?? '';
   const COLLAB_DEV_MODE = process.env.COLLAB_DEV_MODE === 'true';
   if (!COLLAB_JWT_SECRET && !COLLAB_DEV_MODE) {
     throw new Error('COLLAB_JWT_SECRET is required when COLLAB_DEV_MODE=false');
   }
   ```
   - 現状は fail-fast だが、`COLLAB_DEV_MODE=true` の誤運用を防ぐ運用・起動ガードが必要

---

## 総合評価

| 項目 | 評価 | コメント |
|------|------|----------|
| 認証 | 中 | OIDC/JWT実装は良好だが、Devモードのリスクが大きい |
| 認可 | 強 | ロールベースアクセス制御が適切に実装 |
| データ保護 | 中 | SQLインジェクション対策あり、ログ出力に課題 |
| **総合** | **中** | Critical問題の修正が必要 |

---

## 推奨アクション

1. **即座にDev認証エンドポイントを無効化または保護**
2. **`COLLAB_DEV_MODE` の本番禁止ガードを導入し、必須シークレット検証を強化**
3. **ログ出力の機密情報マスキングを実装**
4. **CORS設定を厳格化**
5. **本番環境の環境変数を見直し**

---

## 検証メタデータ

- 対象コミットSHA: `656f6d7135348ca7d6d4dc76eed5afd0e22c7463`
- 計測/確認日時: `2026-03-04 21:44:05 JST (+0900)`
- 本レポートの数値・評価主張は上記SHA時点の状態に基づく
