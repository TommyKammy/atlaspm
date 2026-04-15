import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditOutboxService {
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
    const beforeJson =
      args.beforeJson === undefined
        ? undefined
        : args.beforeJson === null
          ? Prisma.JsonNull
          : (args.beforeJson as Prisma.InputJsonValue);
    const afterJson =
      args.afterJson === undefined
        ? undefined
        : args.afterJson === null
          ? Prisma.JsonNull
          : (args.afterJson as Prisma.InputJsonValue);
    const payload = args.payload === null ? Prisma.JsonNull : (args.payload as Prisma.InputJsonValue);

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
