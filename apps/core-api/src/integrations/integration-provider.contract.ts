export type IntegrationProviderKey = 'slack';

export interface IntegrationJobDefinition {
  jobKey: string;
  trigger: 'auth' | 'sync' | 'webhook' | 'event';
  description: string;
}

export interface IntegrationAuthorizationContext {
  workspaceId: string;
  actorUserId: string;
  providerConfigId?: string;
  callbackUrl?: string;
  payload?: Record<string, unknown>;
}

export interface IntegrationAuthorizationResult {
  status: 'connected' | 'pending' | 'not_supported';
  message?: string;
}

export interface IntegrationSyncContext {
  workspaceId: string;
  actorUserId: string;
  providerConfigId: string;
  scope: string;
  reason: 'manual' | 'scheduled' | 'webhook';
  cursor?: string | null;
}

export interface IntegrationSyncResult {
  status: 'queued' | 'completed' | 'not_supported';
  nextCursor?: string | null;
  message?: string;
}

export interface IntegrationWebhookContext<TPayload = unknown> {
  workspaceId?: string;
  providerConfigId?: string;
  eventType: string;
  headers: Record<string, string | undefined>;
  rawBody?: Buffer;
  payload: TPayload;
  receivedAt: Date;
}

export interface IntegrationWebhookResult {
  accepted: boolean;
  responseBody: Record<string, unknown>;
}

export interface IntegrationProvider {
  readonly key: IntegrationProviderKey;
  readonly displayName: string;

  authorize(context: IntegrationAuthorizationContext): Promise<IntegrationAuthorizationResult>;
  sync(context: IntegrationSyncContext): Promise<IntegrationSyncResult>;
  handleWebhook(context: IntegrationWebhookContext): Promise<IntegrationWebhookResult>;
  describeJobs(): IntegrationJobDefinition[];
}
