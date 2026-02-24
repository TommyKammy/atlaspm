import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from './portfolios.service';
import { PortfoliosController } from './portfolios.controller';

@Module({
  imports: [AuthModule],
  controllers: [PortfoliosController],
  providers: [PrismaService, DomainService, PortfoliosService],
})
export class PortfoliosModule {}
