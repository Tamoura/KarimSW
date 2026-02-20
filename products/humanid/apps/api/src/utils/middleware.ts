/**
 * Shared Route Middleware
 *
 * Reusable authorization helpers for route handlers.
 * Eliminates duplication of requireAdmin and requireOrgOwner across routes.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../types/index.js';

/**
 * Require the authenticated user to have ADMIN role.
 * Calls fastify.authenticate() first, then checks role.
 */
export function buildRequireAdmin(fastify: FastifyInstance) {
  return async function requireAdmin(request: FastifyRequest) {
    await fastify.authenticate(request);
    if (request.currentUser!.role !== 'ADMIN') {
      throw new AppError(403, 'forbidden', 'Admin access required');
    }
  };
}

/**
 * Require the authenticated user to be an OWNER or ADMIN of the given org.
 */
export function buildRequireOrgOwner(fastify: FastifyInstance) {
  return async function requireOrgOwner(userId: string, orgId: string) {
    const membership = await fastify.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE' || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new AppError(403, 'forbidden', 'Only organization owners/admins can perform this action');
    }
  };
}
