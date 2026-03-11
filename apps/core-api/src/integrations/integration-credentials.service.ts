import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { IntegrationCredentialKind } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationCredentialsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upsertCredential(
    providerConfigId: string,
    kind: IntegrationCredentialKind,
    plaintextValue: string,
  ) {
    const encryptedValue = this.encrypt(plaintextValue);
    const redactedValue = this.redact(plaintextValue);
    return this.prisma.integrationCredential.upsert({
      where: {
        providerConfigId_kind: {
          providerConfigId,
          kind,
        },
      },
      create: {
        providerConfigId,
        kind,
        encryptedValue,
        redactedValue,
        lastRotatedAt: new Date(),
      },
      update: {
        encryptedValue,
        redactedValue,
        lastRotatedAt: new Date(),
      },
    });
  }

  async getCredential(providerConfigId: string, kind: IntegrationCredentialKind): Promise<string> {
    const credential = await this.prisma.integrationCredential.findUnique({
      where: {
        providerConfigId_kind: {
          providerConfigId,
          kind,
        },
      },
    });
    if (!credential?.encryptedValue) {
      throw new InternalServerErrorException(`Missing ${kind} credential for integration provider config`);
    }
    return this.decrypt(credential.encryptedValue);
  }

  redact(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length <= 8) {
      return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
    }
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  private decrypt(payload: string): string {
    const [ivB64, authTagB64, ciphertextB64] = payload.split(':');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new InternalServerErrorException('Stored integration credential is malformed');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  private getKey(): Buffer {
    const secret = process.env.INTEGRATION_CREDENTIAL_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('INTEGRATION_CREDENTIAL_SECRET is not configured');
    }
    return createHash('sha256').update(secret, 'utf8').digest();
  }
}
