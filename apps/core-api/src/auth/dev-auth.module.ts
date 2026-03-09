import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DevAuthController } from './dev-auth.controller';
import { shouldRegisterDevAuthController } from './dev-auth-environment';
import { DevAuthEnvironmentGuard } from './dev-auth-environment.guard';

@Module({})
export class DevAuthModule {
  static register(): DynamicModule {
    return {
      module: DevAuthModule,
      imports: [AuthModule],
      controllers: shouldRegisterDevAuthController() ? [DevAuthController] : [],
      providers: [DevAuthEnvironmentGuard],
    };
  }
}
