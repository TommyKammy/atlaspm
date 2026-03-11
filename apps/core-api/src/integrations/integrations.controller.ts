import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { IntegrationsService } from './integrations.service';

class GithubCredentialsDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}

class ConnectGithubIntegrationDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsString()
  @IsNotEmpty()
  repo!: string;

  @IsUUID()
  projectId!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => GithubCredentialsDto)
  credentials!: GithubCredentialsDto;
}

class TriggerSyncDto {
  @IsString()
  @IsNotEmpty()
  scope!: string;
}

@Controller('workspaces/:workspaceId/integrations')
@UseGuards(AuthGuard)
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService)
    private readonly integrations: IntegrationsService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.integrations.listWorkspaceIntegrations(workspaceId, req.user.sub);
  }

  @Post('github')
  async connectGithub(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ConnectGithubIntegrationDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.integrations.connectGithub({
      workspaceId,
      actorUserId: req.user.sub,
      correlationId: req.correlationId,
      key: body.key,
      displayName: body.displayName,
      owner: body.owner,
      repo: body.repo,
      projectId: body.projectId,
      accessToken: body.credentials.accessToken,
    });
  }

  @Post(':providerConfigId/sync')
  @HttpCode(200)
  async triggerSync(
    @Param('workspaceId') workspaceId: string,
    @Param('providerConfigId') providerConfigId: string,
    @Body() body: TriggerSyncDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.integrations.triggerSync({
      workspaceId,
      providerConfigId,
      actorUserId: req.user.sub,
      correlationId: req.correlationId,
      scope: body.scope,
    });
  }
}
