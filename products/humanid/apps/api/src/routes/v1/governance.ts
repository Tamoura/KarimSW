/**
 * Decentralized Governance Routes - /api/v1/governance
 *
 * Community governance for protocol evolution.
 * Proposals, voting, and governance parameters.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const createProposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.string().min(1), // protocol, parameter, policy
  votingDurationHours: z.number().int().min(24).max(720).optional(),
  quorum: z.number().int().min(1).optional(),
});

const voteSchema = z.object({
  vote: z.boolean(),
  reason: z.string().max(1000).optional(),
});

const governanceRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/governance/proposals - Create proposal
  fastify.post('/proposals', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const body = createProposalSchema.parse(request.body);

      const votingDuration = (body.votingDurationHours || 168) * 3600 * 1000;
      const votingStartsAt = new Date();
      const votingEndsAt = new Date(Date.now() + votingDuration);

      const proposal = await fastify.prisma.governanceProposal.create({
        data: {
          authorId: userId,
          title: body.title,
          description: body.description,
          category: body.category,
          status: 'ACTIVE',
          quorum: body.quorum ?? 100,
          votingStartsAt,
          votingEndsAt,
        },
      });

      return reply.code(201).send({
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        category: proposal.category,
        status: proposal.status,
        votesFor: proposal.votesFor,
        votesAgainst: proposal.votesAgainst,
        quorum: proposal.quorum,
        votingStartsAt: proposal.votingStartsAt?.toISOString(),
        votingEndsAt: proposal.votingEndsAt?.toISOString(),
        createdAt: proposal.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/governance/proposals - List proposals
  fastify.get('/proposals', async (request, reply) => {
    const query = request.query as { status?: string; category?: string };
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;

    const proposals = await fastify.prisma.governanceProposal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      proposals: proposals.map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        status: p.status,
        votesFor: p.votesFor,
        votesAgainst: p.votesAgainst,
        quorum: p.quorum,
        votingEndsAt: p.votingEndsAt?.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })),
      total: proposals.length,
    });
  });

  // POST /api/v1/governance/proposals/:id/vote - Vote on proposal
  fastify.post('/proposals/:id/vote', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };
      const body = voteSchema.parse(request.body);

      const proposal = await fastify.prisma.governanceProposal.findUnique({ where: { id } });
      if (!proposal) throw new AppError(404, 'not-found', 'Proposal not found');
      if (proposal.status !== 'ACTIVE') throw new AppError(400, 'bad-request', 'Proposal is not active');
      if (proposal.votingEndsAt && proposal.votingEndsAt < new Date()) {
        throw new AppError(400, 'bad-request', 'Voting period has ended');
      }

      await fastify.prisma.governanceVote.create({
        data: {
          proposalId: id,
          voterId: userId,
          vote: body.vote,
          reason: body.reason,
        },
      });

      // Update vote counts
      const updated = await fastify.prisma.governanceProposal.update({
        where: { id },
        data: body.vote
          ? { votesFor: { increment: 1 } }
          : { votesAgainst: { increment: 1 } },
      });

      return reply.code(201).send({
        proposalId: id,
        votesFor: updated.votesFor,
        votesAgainst: updated.votesAgainst,
        totalVotes: updated.votesFor + updated.votesAgainst,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/governance/proposals/:id/results - Proposal results
  fastify.get('/proposals/:id/results', async (request, reply) => {
    const { id } = request.params as { id: string };

    const proposal = await fastify.prisma.governanceProposal.findUnique({
      where: { id },
      include: { _count: { select: { votes: true } } },
    });

    if (!proposal) throw new AppError(404, 'not-found', 'Proposal not found');

    const totalVotes = proposal.votesFor + proposal.votesAgainst;

    return reply.send({
      proposalId: proposal.id,
      title: proposal.title,
      status: proposal.status,
      votesFor: proposal.votesFor,
      votesAgainst: proposal.votesAgainst,
      totalVotes,
      quorum: proposal.quorum,
      quorumReached: totalVotes >= proposal.quorum,
      approval: totalVotes > 0 ? Math.round((proposal.votesFor / totalVotes) * 100) : 0,
      votingEndsAt: proposal.votingEndsAt?.toISOString(),
    });
  });

  // GET /api/v1/governance/params - Governance parameters
  fastify.get('/params', async (_request, reply) => {
    return reply.send({
      defaultQuorum: 100,
      minVotingDuration: 24,
      maxVotingDuration: 720,
      categories: ['protocol', 'parameter', 'policy', 'treasury'],
      votingModel: 'simple_majority',
      weightedVoting: false,
    });
  });
};

export default governanceRoutes;
