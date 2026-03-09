import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

const ONE_MINUTE_MS = 60_000;

export const THROTTLE_POLICIES = {
  default: {
    // General authenticated API traffic can legitimately burst during UI bootstrap and E2E setup.
    limit: 300,
    ttl: ONE_MINUTE_MS,
  },
  publicFormSubmission: {
    limit: 10,
    ttl: ONE_MINUTE_MS,
  },
  strictPublicWebhook: {
    limit: 10,
    ttl: ONE_MINUTE_MS,
  },
  safePublicRead: {
    limit: 1000,
    ttl: ONE_MINUTE_MS,
  },
} as const;

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ...THROTTLE_POLICIES.default,
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [ThrottlerModule],
})
export class ApiThrottlingModule {}
