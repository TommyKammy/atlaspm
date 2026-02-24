import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [AuthModule],
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}
