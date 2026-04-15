import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from './audit-outbox.service';
import { AuthorizationService } from './authorization.service';
import { DomainService } from './domain.service';
import { IdentityService } from './identity.service';
import { WorkspaceDefaultsService } from './workspace-defaults.service';

@Global()
@Module({
  providers: [
    PrismaService,
    AuditOutboxService,
    AuthorizationService,
    DomainService,
    IdentityService,
    WorkspaceDefaultsService,
  ],
  exports: [
    PrismaService,
    AuditOutboxService,
    AuthorizationService,
    DomainService,
    IdentityService,
    WorkspaceDefaultsService,
  ],
})
export class CommonServicesModule {}
