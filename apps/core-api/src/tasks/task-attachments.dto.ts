import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MAX_IMAGE_UPLOAD_BYTES } from './task-attachments.constants';

export class InitiateAttachmentDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_UPLOAD_BYTES)
  sizeBytes!: number;
}

export class CompleteAttachmentDto {
  @IsUUID()
  attachmentId!: string;
}
