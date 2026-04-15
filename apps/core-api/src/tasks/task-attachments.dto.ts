import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
  @Max(10_000_000)
  sizeBytes!: number;
}

export class CompleteAttachmentDto {
  @IsUUID()
  attachmentId!: string;
}
