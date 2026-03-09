import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { getAuthCookieNames } from './session-cookie';

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
  async create(
    @Body() body: DevTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.mintDevToken(body.sub, body.email, body.name);
    const csrfToken = randomBytes(24).toString('base64url');
    const cookies = getAuthCookieNames(req);

    res.cookie(cookies.session, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookies.secure,
      path: '/',
    });
    res.cookie(cookies.csrf, csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: cookies.secure,
      path: '/',
    });

    return { token };
  }
}
