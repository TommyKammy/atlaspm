import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DevAuthController } from './dev-auth.controller';

@Module({
  imports: [AuthModule],
  controllers: [DevAuthController],
})
export class DevAuthModule {}
