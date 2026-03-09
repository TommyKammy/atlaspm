import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { THROTTLE_POLICIES } from '../common/throttling';

const PUBLIC_FORM_SUBMISSION_LIMIT = THROTTLE_POLICIES.publicFormSubmission.limit;
const PUBLIC_FORM_SUBMISSION_TTL = THROTTLE_POLICIES.publicFormSubmission.ttl;
const PUBLIC_FORM_SUBMISSION_THROTTLER: ThrottlerOptions = {
  name: 'public-form-submission',
  limit: PUBLIC_FORM_SUBMISSION_LIMIT,
  ttl: PUBLIC_FORM_SUBMISSION_TTL,
};

@Injectable()
export class PublicFormSubmissionThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    const formId = req.params?.id;
    if (typeof formId !== 'string') {
      return true;
    }

    const form = await this.prisma.form.findUnique({
      where: { id: formId },
      select: { isPublic: true },
    });
    if (!form?.isPublic) {
      return true;
    }

    return this.handleRequest({
      context,
      limit: PUBLIC_FORM_SUBMISSION_LIMIT,
      ttl: PUBLIC_FORM_SUBMISSION_TTL,
      throttler: PUBLIC_FORM_SUBMISSION_THROTTLER,
      blockDuration: PUBLIC_FORM_SUBMISSION_TTL,
      getTracker: this.commonOptions.getTracker!,
      generateKey: this.commonOptions.generateKey!,
    });
  }
}
