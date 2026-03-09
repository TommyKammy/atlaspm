import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

const ONE_MINUTE_MS = 60_000;

export const THROTTLE_POLICIES = {
  default: {
    limit: 60,
    ttl: ONE_MINUTE_MS,
  },
  strictPublicWebhook: {
    limit: 10,
    ttl: ONE_MINUTE_MS,
  },
  safePublicRead: {
    limit: 300,
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
