-- CreateEnum
CREATE TYPE "IntegrationProviderKind" AS ENUM ('SLACK');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "IntegrationCredentialKind" AS ENUM ('ACCESS_TOKEN', 'REFRESH_TOKEN', 'API_TOKEN', 'SIGNING_SECRET');

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationMappingDirection" AS ENUM ('IMPORT', 'EXPORT', 'BIDIRECTIONAL');

-- CreateTable
CREATE TABLE "integration_provider_configs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "IntegrationProviderKind" NOT NULL,
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "settings" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "provider_config_id" TEXT NOT NULL,
    "kind" "IntegrationCredentialKind" NOT NULL,
    "secret_ref" TEXT,
    "encrypted_value" TEXT,
    "redacted_value" TEXT,
    "expires_at" TIMESTAMP(3),
    "last_rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_states" (
    "id" TEXT NOT NULL,
    "provider_config_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "IntegrationSyncStatus" NOT NULL DEFAULT 'IDLE',
    "cursor" TEXT,
    "next_sync_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_entity_mappings" (
    "id" TEXT NOT NULL,
    "provider_config_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "direction" "IntegrationMappingDirection" NOT NULL DEFAULT 'BIDIRECTIONAL',
    "internal_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_updated_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_provider_configs_workspace_id_key_key" ON "integration_provider_configs"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "integration_provider_configs_workspace_id_provider_status_idx" ON "integration_provider_configs"("workspace_id", "provider", "status");

-- CreateIndex
CREATE INDEX "integration_provider_configs_created_by_user_id_idx" ON "integration_provider_configs"("created_by_user_id");

-- CreateIndex
CREATE INDEX "integration_provider_configs_updated_by_user_id_idx" ON "integration_provider_configs"("updated_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_provider_config_id_kind_key" ON "integration_credentials"("provider_config_id", "kind");

-- CreateIndex
CREATE INDEX "integration_credentials_expires_at_idx" ON "integration_credentials"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sync_states_provider_config_id_scope_key" ON "integration_sync_states"("provider_config_id", "scope");

-- CreateIndex
CREATE INDEX "integration_sync_states_status_next_sync_at_idx" ON "integration_sync_states"("status", "next_sync_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_entity_mappings_provider_config_id_entity_type_internal_id_key" ON "integration_entity_mappings"("provider_config_id", "entity_type", "internal_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_entity_mappings_provider_config_id_entity_type_external_id_key" ON "integration_entity_mappings"("provider_config_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "integration_entity_mappings_provider_config_id_entity_type_direction_idx" ON "integration_entity_mappings"("provider_config_id", "entity_type", "direction");

-- AddForeignKey
ALTER TABLE "integration_provider_configs" ADD CONSTRAINT "integration_provider_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_provider_configs" ADD CONSTRAINT "integration_provider_configs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_provider_configs" ADD CONSTRAINT "integration_provider_configs_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_provider_config_id_fkey" FOREIGN KEY ("provider_config_id") REFERENCES "integration_provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_states" ADD CONSTRAINT "integration_sync_states_provider_config_id_fkey" FOREIGN KEY ("provider_config_id") REFERENCES "integration_provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_entity_mappings" ADD CONSTRAINT "integration_entity_mappings_provider_config_id_fkey" FOREIGN KEY ("provider_config_id") REFERENCES "integration_provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Secret-handling invariants: keep plaintext out of the database and require either
-- an encrypted blob or an external secret reference for each credential row.
ALTER TABLE "integration_credentials"
ADD CONSTRAINT "integration_credentials_secret_storage_check"
CHECK (
  "secret_ref" IS NOT NULL OR "encrypted_value" IS NOT NULL
);
