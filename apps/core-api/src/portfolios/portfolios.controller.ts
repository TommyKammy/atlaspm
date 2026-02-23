import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { PortfoliosService, CreatePortfolioDto, UpdatePortfolioDto } from './portfolios.service';
import { IsString, IsOptional, IsArray, ArrayMaxSize } from 'class-validator';

class CreatePortfolioBody implements CreatePortfolioDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  projectIds?: string[];
}

class UpdatePortfolioBody implements UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('workspaces/:workspaceId/portfolios')
@UseGuards(AuthGuard)
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Post()
  async createPortfolio(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreatePortfolioBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.createPortfolio(workspaceId, req.user.sub, body);
  }

  @Get()
  async getPortfolios(
    @Param('workspaceId') workspaceId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.getPortfolios(workspaceId, req.user.sub);
  }

  @Get(':portfolioId')
  async getPortfolio(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.getPortfolio(workspaceId, portfolioId, req.user.sub);
  }

  @Patch(':portfolioId')
  async updatePortfolio(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
    @Body() body: UpdatePortfolioBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.updatePortfolio(workspaceId, portfolioId, req.user.sub, body);
  }

  @Delete(':portfolioId')
  async deletePortfolio(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.deletePortfolio(workspaceId, portfolioId, req.user.sub);
  }

  @Post(':portfolioId/projects/:projectId')
  async addProjectToPortfolio(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
    @Param('projectId') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.addProjectToPortfolio(
      workspaceId,
      portfolioId,
      projectId,
      req.user.sub,
    );
  }

  @Delete(':portfolioId/projects/:projectId')
  async removeProjectFromPortfolio(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
    @Param('projectId') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.portfoliosService.removeProjectFromPortfolio(
      workspaceId,
      portfolioId,
      projectId,
      req.user.sub,
    );
  }
}
