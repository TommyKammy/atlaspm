import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';

@Module({
  imports: [AuthModule],
  controllers: [DashboardsController],
  providers: [PrismaService, DashboardsService],
})
export class DashboardsModule {}
