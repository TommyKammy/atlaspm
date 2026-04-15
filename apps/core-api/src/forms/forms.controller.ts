import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Inject,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsEnum,
  ValidateNested,
  IsInt,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../auth/auth.guard';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { AuthorizationService } from '../common/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole, FormQuestionType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PublicFormSubmissionThrottleGuard } from './public-form-submission-throttle.guard';

class CreateFormDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateFormDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

class CreateQuestionDto {
  @IsEnum(FormQuestionType)
  type: FormQuestionType;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  options?: Array<{ label: string; value: string }>;

  @IsOptional()
  @IsInt()
  position?: number;
}

class UpdateQuestionDto {
  @IsOptional()
  @IsEnum(FormQuestionType)
  type?: FormQuestionType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  options?: Array<{ label: string; value: string }>;

  @IsOptional()
  @IsInt()
  position?: number;
}

class SubmitFormDto {
  @IsString()
  submitterName: string;

  @IsEmail()
  submitterEmail: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormAnswerDto)
  answers: FormAnswerDto[];
}

class FormAnswerDto {
  @IsString()
  questionId: string;

  @IsOptional()
  value?: string | number | boolean | string[];
}

class ListFormsQuery {
  @IsOptional()
  @IsString()
  includeArchived?: string;
}

@Controller()
export class FormsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  private logPublicFormSubmission(
    req: AppRequest,
    form: { id: string; projectId: string; isPublic: boolean },
    event: { outcome: 'accepted' } | { outcome: 'rejected'; reason: string },
  ) {
    console.info(
      JSON.stringify({
        level: 'info',
        type: `form.submission.${event.outcome}`,
        formId: form.id,
        projectId: form.projectId,
        isPublic: form.isPublic,
        correlationId: req.correlationId,
        reason: event.outcome === 'rejected' ? event.reason : undefined,
      }),
    );
  }

  @Post('projects/:id/forms')
  @UseGuards(AuthGuard)
  async create(
    @Param('id') projectId: string,
    @Body() body: CreateFormDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.authorization.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    const trimmedTitle = body.title.trim();
    if (!trimmedTitle) {
      throw new ConflictException('Form title cannot be empty');
    }

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          projectId,
          title: trimmedTitle,
          description: body.description?.trim(),
          createdByUserId: req.user.sub,
        },
        include: {
          questions: {
            orderBy: { position: 'asc' },
          },
        },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Form',
        entityId: form.id,
        action: 'form.created',
        afterJson: form,
        correlationId: req.correlationId,
        outboxType: 'form.created',
        payload: { formId: form.id, projectId },
      });

      return form;
    });
  }

  @Get('projects/:id/forms')
  @UseGuards(AuthGuard)
  async list(
    @Param('id') projectId: string,
    @Query() query: ListFormsQuery,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.authorization.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    const includeArchived = query.includeArchived === 'true';
    const forms = await this.prisma.form.findMany({
      where: {
        projectId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: {
        _count: {
          select: { questions: true, submissions: true },
        },
        createdBy: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return forms;
  }

  @Get('forms/:id')
  @UseGuards(AuthGuard)
  async get(
    @Param('id') formId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
        },
        createdBy: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    await this.authorization.requireProjectRole(form.projectId, req.user.sub, ProjectRole.MEMBER);

    return form;
  }

  @Put('forms/:id')
  @UseGuards(AuthGuard)
  async update(
    @Param('id') formId: string,
    @Body() body: UpdateFormDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    await this.authorization.requireProjectRole(form.projectId, req.user.sub, ProjectRole.MEMBER);

    const data: Prisma.FormUpdateInput = {};
    if (body.title !== undefined) {
      const trimmedTitle = body.title.trim();
      if (!trimmedTitle) {
        throw new ConflictException('Form title cannot be empty');
      }
      data.title = trimmedTitle;
    }
    if (body.description !== undefined) data.description = body.description?.trim() ?? null;
    if (body.isPublic !== undefined) {
      data.isPublic = body.isPublic;
      if (body.isPublic && !form.publicToken) {
        data.publicToken = randomBytes(32).toString('hex');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.form.update({
        where: { id: formId },
        data,
        include: {
          questions: {
            orderBy: { position: 'asc' },
          },
        },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Form',
        entityId: formId,
        action: 'form.updated',
        beforeJson: form,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'form.updated',
        payload: { formId },
      });

      return updated;
    });
  }

  @Delete('forms/:id')
  @UseGuards(AuthGuard)
  async archive(
    @Param('id') formId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    await this.authorization.requireProjectRole(form.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.form.update({
        where: { id: formId },
        data: { archivedAt: new Date() },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Form',
        entityId: formId,
        action: 'form.archived',
        beforeJson: form,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'form.archived',
        payload: { formId },
      });

      return updated;
    });
  }

  @Post('forms/:id/questions')
  @UseGuards(AuthGuard)
  async createQuestion(
    @Param('id') formId: string,
    @Body() body: CreateQuestionDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    await this.authorization.requireProjectRole(form.projectId, req.user.sub, ProjectRole.MEMBER);

    const trimmedLabel = body.label.trim();
    if (!trimmedLabel) {
      throw new ConflictException('Question label cannot be empty');
    }

    let position = body.position;
    if (position === undefined) {
      const maxPositionQuestion = await this.prisma.formQuestion.findFirst({
        where: { formId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (maxPositionQuestion?.position ?? 0) + 1000;
    }

    const data: Prisma.FormQuestionCreateInput = {
      form: { connect: { id: formId } },
      type: body.type,
      label: trimmedLabel,
      description: body.description?.trim() || null,
      required: body.required ?? false,
      position,
    };

    if (body.options) {
      data.options = body.options as Prisma.InputJsonValue;
    }

    const question = await this.prisma.formQuestion.create({ data });

    return question;
  }

  @Put('forms/questions/:id')
  @UseGuards(AuthGuard)
  async updateQuestion(
    @Param('id') questionId: string,
    @Body() body: UpdateQuestionDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const question = await this.prisma.formQuestion.findFirst({
      where: { id: questionId },
      include: { form: true },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await this.authorization.requireProjectRole(question.form.projectId, req.user.sub, ProjectRole.MEMBER);

    const data: Prisma.FormQuestionUpdateInput = {};
    if (body.type !== undefined) data.type = body.type;
    if (body.label !== undefined) data.label = body.label.trim();
    if (body.description !== undefined) data.description = body.description?.trim() ?? null;
    if (body.required !== undefined) data.required = body.required;
    if (body.options !== undefined) data.options = body.options ?? null;
    if (body.position !== undefined) data.position = body.position;

    const updated = await this.prisma.formQuestion.update({
      where: { id: questionId },
      data,
    });

    return updated;
  }

  @Delete('forms/questions/:id')
  @UseGuards(AuthGuard)
  async deleteQuestion(
    @Param('id') questionId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const question = await this.prisma.formQuestion.findFirst({
      where: { id: questionId },
      include: { form: true },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await this.authorization.requireProjectRole(question.form.projectId, req.user.sub, ProjectRole.MEMBER);

    await this.prisma.formQuestion.delete({
      where: { id: questionId },
    });

    return { deleted: true };
  }

  @Post('forms/:id/submit')
  @UseGuards(PublicFormSubmissionThrottleGuard)
  async submit(
    @Param('id') formId: string,
    @Body() body: SubmitFormDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId },
      include: {
        questions: true,
        project: {
          include: {
            sections: {
              where: { isDefault: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    if (form.archivedAt) {
      throw new ConflictException('Form is archived');
    }

    if (!form.isPublic) {
      if (!req.user?.sub) {
        throw new ConflictException('Authentication required for non-public forms');
      }
      await this.authorization.requireProjectRole(form.projectId, req.user.sub, ProjectRole.MEMBER);
    }

    if (form.isPublic && body.website?.trim()) {
      this.logPublicFormSubmission(req, form, { outcome: 'rejected', reason: 'honeypot' });
      throw new BadRequestException('Spam detected');
    }

    if (form.questions.length === 0) {
      throw new ConflictException('Form has no questions');
    }

    const defaultSection = form.project.sections[0];
    if (!defaultSection) {
      throw new ConflictException('Project has no default section');
    }

    const questionMap = new Map(form.questions.map(q => [q.id, q]));
    const requiredQuestions = form.questions.filter(q => q.required);
    const seenQuestionIds = new Set<string>();
    const answeredQuestionIds = new Set<string>();

    for (const answer of body.answers) {
      if (seenQuestionIds.has(answer.questionId)) {
        throw new ConflictException(`Duplicate answer for question: ${answer.questionId}`);
      }
      seenQuestionIds.add(answer.questionId);
      answeredQuestionIds.add(answer.questionId);

      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new ConflictException(`Invalid question ID: ${answer.questionId}`);
      }
      if (question.required && (answer.value === undefined || answer.value === null || answer.value === '')) {
        throw new ConflictException(`Question "${question.label}" is required`);
      }
    }

    for (const requiredQuestion of requiredQuestions) {
      if (!answeredQuestionIds.has(requiredQuestion.id)) {
        throw new ConflictException(`Question "${requiredQuestion.label}" is required`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.formSubmission.create({
        data: {
          formId,
          submitterName: body.submitterName.trim(),
          submitterEmail: body.submitterEmail.trim(),
        },
      });

      for (const answer of body.answers) {
        const question = questionMap.get(answer.questionId)!;
        const value = answer.value;

        const answerData: Prisma.FormAnswerCreateInput = {
          submission: { connect: { id: submission.id } },
          question: { connect: { id: question.id } },
        };

        if (typeof value === 'string') {
          answerData.valueText = value;
        } else if (typeof value === 'number') {
          answerData.valueNumber = value;
        } else if (typeof value === 'boolean') {
          answerData.valueBoolean = value;
        } else if (Array.isArray(value)) {
          answerData.valueJson = value;
        }

        await tx.formAnswer.create({ data: answerData });
      }

      const maxPositionTask = await tx.task.findFirst({
        where: { sectionId: defaultSection.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const nextPosition = (maxPositionTask?.position ?? -1) + 1;

      const task = await tx.task.create({
        data: {
          projectId: form.projectId,
          sectionId: defaultSection.id,
          title: `Form submission: ${form.title}`,
          description: `Submitted by ${body.submitterName} (${body.submitterEmail})`,
          position: nextPosition,
        },
      });

      await tx.formSubmission.update({
        where: { id: submission.id },
        data: { createdTaskId: task.id },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user?.sub ?? `anonymous:${body.submitterEmail}`,
        entityType: 'FormSubmission',
        entityId: submission.id,
        action: 'form.submitted',
        afterJson: { submissionId: submission.id, taskId: task.id },
        correlationId: req.correlationId,
        outboxType: 'form.submitted',
        payload: { submissionId: submission.id, formId, taskId: task.id },
      });

      const result = {
        submissionId: submission.id,
        taskId: task.id,
      };

      if (form.isPublic) {
        this.logPublicFormSubmission(req, form, { outcome: 'accepted' });
      }

      return result;
    });
  }

  @Get('forms/:id/submissions')
  @UseGuards(AuthGuard)
  async listSubmissions(
    @Param('id') formId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    await this.authorization.requireProjectRole(form.projectId, req.user.sub, ProjectRole.MEMBER);

    const submissions = await this.prisma.formSubmission.findMany({
      where: { formId },
      include: {
        createdTask: {
          select: { id: true, title: true, status: true },
        },
        _count: {
          select: { answers: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return submissions;
  }

  @Get('forms/public/:token')
  async getPublicForm(@Param('token') token: string) {
    const form = await this.prisma.form.findFirst({
      where: {
        publicToken: token,
        isPublic: true,
        archivedAt: null,
      },
      include: {
        questions: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    return form;
  }
}
