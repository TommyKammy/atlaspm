import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getAuthCookieNames } from './session-cookie';

@Controller('auth')
export class AuthController {
  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = getAuthCookieNames(req);

    res.clearCookie(cookies.session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookies.secure,
      path: '/',
    });
    res.clearCookie(cookies.csrf, {
      httpOnly: false,
      sameSite: 'lax',
      secure: cookies.secure,
      path: '/',
    });
  }
}
