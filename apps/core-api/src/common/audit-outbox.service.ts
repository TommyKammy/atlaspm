import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditOutboxService {
  private normalizeJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async appendAuditOutbox(args: {
    tx: Prisma.TransactionClient;
    actor: string;
    entityType: string;
    entityId: string;
    action: string;
    beforeJson?: unknown;
    afterJson?: unknown;
    correlationId?: string;
    outboxType: string;
    payload: unknown;
  }) {
    const correlationId = args.correlationId ?? 'test-correlation-id';
    const beforeJson = this.normalizeJson(args.beforeJson);
    const afterJson = this.normalizeJson(args.afterJson);
    const payload = this.normalizeJson(args.payload) ?? Prisma.JsonNull;

    await args.tx.auditEvent.create({
      data: {
        actor: args.actor,
        entityType: args.entityType,
        entityId: args.entityId,
        action: args.action,
        beforeJson,
        afterJson,
        correlationId,
      },
    });
    await args.tx.outboxEvent.create({
      data: {
        type: args.outboxType,
        payload,
        correlationId,
      },
    });
  }
}
