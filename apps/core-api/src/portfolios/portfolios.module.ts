import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonServicesModule } from '../common/common-services.module';
import { PortfoliosService } from './portfolios.service';
import { PortfoliosController } from './portfolios.controller';

@Module({
  imports: [AuthModule, CommonServicesModule],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
})
export class PortfoliosModule {}
