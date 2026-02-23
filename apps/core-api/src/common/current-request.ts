import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRequest } from './types';

export const CurrentRequest = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>();
});
