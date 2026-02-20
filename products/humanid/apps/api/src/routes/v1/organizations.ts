/**
 * Organization Routes - /api/v1/orgs
 *
 * Multi-tenant organization management with RBAC.
 * Roles: OWNER, ADMIN, MEMBER
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const createOrgSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  domain: z.string().optional(),
});

const inviteMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

const updateMemberSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper: check if user has required role in org
  async function requireOrgRole(userId: string, orgId: string, requiredRoles: string[]) {
    const membership = await fastify.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AppError(403, 'forbidden', 'You are not a member of this organization');
    }
    if (!requiredRoles.includes(membership.role)) {
      throw new AppError(403, 'forbidden', `Requires role: ${requiredRoles.join(' or ')}`);
    }
    return membership;
  }

  // POST /api/v1/orgs - Create organization
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = createOrgSchema.parse(request.body);
      const userId = request.currentUser!.id;

      // Check slug uniqueness
      const existing = await fastify.prisma.organization.findUnique({ where: { slug: body.slug } });
      if (existing) {
        throw new AppError(409, 'conflict', 'An organization with this slug already exists');
      }

      const org = await fastify.prisma.organization.create({
        data: {
          name: body.name,
          slug: body.slug,
          domain: body.domain,
          settings: {},
        },
      });

      // Add creator as OWNER
      await fastify.prisma.organizationMember.create({
        data: {
          orgId: org.id,
          userId,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
          invitedBy: userId,
        },
      });

      logger.info('Organization created', { orgId: org.id, userId });

      return reply.code(201).send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.domain,
        createdAt: org.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/v1/orgs/:id - Get organization
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const org = await fastify.prisma.organization.findUnique({
        where: { id },
        include: {
          members: {
            where: { status: 'ACTIVE' },
            include: { user: { select: { id: true, email: true, role: true } } },
          },
        },
      });

      if (!org) {
        throw new AppError(404, 'not-found', 'Organization not found');
      }

      // Check membership
      const isMember = org.members.some((m) => m.userId === userId);
      if (!isMember) {
        throw new AppError(403, 'forbidden', 'You are not a member of this organization');
      }

      return reply.send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.domain,
        ssoEnforced: org.ssoEnforced,
        members: org.members.map((m) => ({
          userId: m.userId,
          email: m.user.email,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt?.toISOString() || null,
        })),
        createdAt: org.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/orgs/:id/members - Invite member
  fastify.post('/:id/members', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id: orgId } = request.params as { id: string };
      const userId = request.currentUser!.id;
      const body = inviteMemberSchema.parse(request.body);

      // Only OWNER and ADMIN can invite
      await requireOrgRole(userId, orgId, ['OWNER', 'ADMIN']);

      // Check if already a member
      const existing = await fastify.prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: body.userId } },
      });
      if (existing && existing.status === 'ACTIVE') {
        throw new AppError(409, 'conflict', 'User is already a member');
      }

      const member = existing
        ? await fastify.prisma.organizationMember.update({
            where: { id: existing.id },
            data: { role: body.role, status: 'ACTIVE', joinedAt: new Date(), invitedBy: userId },
          })
        : await fastify.prisma.organizationMember.create({
            data: {
              orgId,
              userId: body.userId,
              role: body.role,
              status: 'ACTIVE',
              joinedAt: new Date(),
              invitedBy: userId,
            },
          });

      logger.info('Member added to organization', { orgId, newMemberId: body.userId, role: body.role });

      return reply.code(201).send({
        id: member.id,
        orgId: member.orgId,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt?.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/v1/orgs/:id/members - List members
  fastify.get('/:id/members', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id: orgId } = request.params as { id: string };
      const userId = request.currentUser!.id;

      // Any member can list
      await requireOrgRole(userId, orgId, ['OWNER', 'ADMIN', 'MEMBER']);

      const members = await fastify.prisma.organizationMember.findMany({
        where: { orgId, status: 'ACTIVE' },
        include: { user: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({
        members: members.map((m) => ({
          userId: m.userId,
          email: m.user.email,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt?.toISOString() || null,
        })),
        total: members.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // PATCH /api/v1/orgs/:id/members/:userId - Update member role
  fastify.patch('/:id/members/:userId', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id: orgId, userId: targetUserId } = request.params as { id: string; userId: string };
      const currentUserId = request.currentUser!.id;
      const body = updateMemberSchema.parse(request.body);

      // Only OWNER can change roles
      await requireOrgRole(currentUserId, orgId, ['OWNER']);

      const member = await fastify.prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: targetUserId } },
      });
      if (!member || member.status !== 'ACTIVE') {
        throw new AppError(404, 'not-found', 'Member not found');
      }

      const updated = await fastify.prisma.organizationMember.update({
        where: { id: member.id },
        data: { role: body.role },
      });

      logger.info('Member role updated', { orgId, targetUserId, newRole: body.role });

      return reply.send({
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // DELETE /api/v1/orgs/:id/members/:userId - Remove member
  fastify.delete('/:id/members/:userId', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id: orgId, userId: targetUserId } = request.params as { id: string; userId: string };
      const currentUserId = request.currentUser!.id;

      // OWNER and ADMIN can remove members
      await requireOrgRole(currentUserId, orgId, ['OWNER', 'ADMIN']);

      const member = await fastify.prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: targetUserId } },
      });
      if (!member || member.status !== 'ACTIVE') {
        throw new AppError(404, 'not-found', 'Member not found');
      }

      // Cannot remove an OWNER
      if (member.role === 'OWNER') {
        throw new AppError(400, 'bad-request', 'Cannot remove the organization owner');
      }

      await fastify.prisma.organizationMember.update({
        where: { id: member.id },
        data: { status: 'REMOVED' },
      });

      logger.info('Member removed from organization', { orgId, removedUserId: targetUserId });

      return reply.send({ message: 'Member removed from organization' });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default organizationRoutes;
