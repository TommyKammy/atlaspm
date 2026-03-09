import { Injectable, OnModuleInit } from '@nestjs/common';
import { assertSafeDevAuthEnvironment } from './dev-auth-environment';

@Injectable()
export class DevAuthEnvironmentGuard implements OnModuleInit {
  onModuleInit() {
    assertSafeDevAuthEnvironment();
  }
}
