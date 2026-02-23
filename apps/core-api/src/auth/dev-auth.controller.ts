import { Body, Controller, Inject, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsEmail, IsOptional, IsString } from 'class-validator';

class DevTokenDto {
  @IsString()
  sub!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

@Controller('dev-auth')
export class DevAuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('token')
  async create(@Body() body: DevTokenDto) {
    const token = await this.auth.mintDevToken(body.sub, body.email, body.name);
    return { token };
  }
}
