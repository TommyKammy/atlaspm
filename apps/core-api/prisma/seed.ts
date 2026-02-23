import { PrismaClient, ProjectRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = 'dev-user-1';
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: 'dev@example.com', displayName: 'Dev User' },
    update: {},
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: 'dev-workspace-1' },
    create: { id: 'dev-workspace-1', name: 'Default Workspace' },
    update: {},
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    create: { workspaceId: workspace.id, userId },
    update: {},
  });

  const project = await prisma.project.upsert({
    where: { id: 'dev-project-1' },
    create: { id: 'dev-project-1', workspaceId: workspace.id, name: 'AtlasPM Sample' },
    update: {},
  });

  await prisma.projectMembership.upsert({
    where: { projectId_userId: { projectId: project.id, userId } },
    create: { projectId: project.id, userId, role: ProjectRole.ADMIN },
    update: {},
  });
}

main().finally(async () => prisma.$disconnect());
