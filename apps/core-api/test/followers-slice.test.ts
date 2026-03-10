import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(appRoot, 'prisma', 'schema.prisma');
const srcRoot = path.join(appRoot, 'src');

function routeDecoratorPattern(method: string, routePath: string) {
  const escapedRoutePath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${method}\\s*\\(\\s*['"\`]${escapedRoutePath}['"\`]\\s*\\)`);
}

function controllerDecoratorPattern(routePath: string) {
  const escapedRoutePath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@Controller\\s*\\(\\s*['"\`]${escapedRoutePath}['"\`]\\s*\\)`);
}

function schemaPattern(snippet: string) {
  const escapedSnippet = snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whitespaceTolerant = escapedSnippet.replace(/\s+/g, '\\s*');
  return new RegExp(whitespaceTolerant);
}

function collectTypeScriptSources(dirPath: string): string[] {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptSources(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(readFileSync(entryPath, 'utf8'));
    }
  }
  return files;
}

describe('task and project follower slice', () => {
  test('defines first-class follower models and exposes follow API routes', () => {
    expect(existsSync(schemaPath)).toBe(true);

    const schemaSource = readFileSync(schemaPath, 'utf8');
    const sourceFiles = collectTypeScriptSources(srcRoot);

    expect(schemaSource).toMatch(schemaPattern('model TaskFollower'));
    expect(schemaSource).toMatch(schemaPattern('model ProjectFollower'));
    expect(schemaSource).toMatch(schemaPattern('@@unique([taskId, userId])'));
    expect(schemaSource).toMatch(schemaPattern('@@unique([projectId, userId])'));

    expect(sourceFiles.some((source) => routeDecoratorPattern('Get', 'tasks/:id/followers').test(source))).toBe(true);
    expect(sourceFiles.some((source) => routeDecoratorPattern('Post', 'tasks/:id/followers').test(source))).toBe(true);
    expect(sourceFiles.some((source) => routeDecoratorPattern('Delete', 'tasks/:id/followers/me').test(source))).toBe(true);

    expect(
      sourceFiles.some(
        (source) =>
          controllerDecoratorPattern('projects').test(source) &&
          routeDecoratorPattern('Get', ':id/followers').test(source),
      ),
    ).toBe(true);
    expect(
      sourceFiles.some(
        (source) =>
          controllerDecoratorPattern('projects').test(source) &&
          routeDecoratorPattern('Post', ':id/followers').test(source),
      ),
    ).toBe(true);
    expect(
      sourceFiles.some(
        (source) =>
          controllerDecoratorPattern('projects').test(source) &&
          routeDecoratorPattern('Delete', ':id/followers/me').test(source),
      ),
    ).toBe(true);
  });
});
