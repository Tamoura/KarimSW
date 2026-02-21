/**
 * Auth Routes - /api/v1/auth
 *
 * Provides user registration, login, token refresh, logout,
 * and email verification endpoints.
 *
 * All endpoints are fully implemented:
 * - Register: creates user + session, returns JWT pair
 * - Login: authenticates, creates session, returns JWT pair
 * - Refresh: rotates refresh token (old token invalidated)
 * - Logout: deletes session (single or all)
 * - Verify-email: validates token from Redis, sets emailVerified=true
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { createHash, randomUUID } from 'crypto';

// ==================== Zod Schemas ====================

const registerSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit'
    ),
  role: z.enum(['HOLDER', 'ISSUER', 'DEVELOPER']).optional().default('HOLDER'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

const logoutSchema = z.object({
  refresh_token: z.string().optional(),
  all: z.boolean().optional().default(false),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// ==================== Routes ====================

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/auth/register
  fastify.post('/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if user already exists (prevent email enumeration by returning
      // same response shape)
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        // SECURITY: Hash password even for existing users to prevent timing-based enumeration
        await hashPassword(body.password);
        logger.info('Registration attempted for existing email', { email: body.email });
        return reply.code(201).send({
          message: 'Account created successfully. Please check your email for verification.',
        });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(body.password);

      const user = await fastify.prisma.user.create({
        data: {
          email: body.email,
          passwordHash,
          role: body.role as 'HOLDER' | 'ISSUER' | 'DEVELOPER',
        },
      });

      // Generate access token
      const accessToken = fastify.jwt.sign(
        { userId: user.id, role: user.role, jti: randomUUID() },
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
      );

      // Generate refresh token
      const refreshToken = fastify.jwt.sign(
        { userId: user.id, type: 'refresh', jti: randomUUID() },
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
      );

      // Store session with refresh token hash
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days
      await fastify.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          deviceInfo: (request.headers['user-agent'] as string) || 'unknown',
          ipAddress: request.ip || 'unknown',
          expiresAt: new Date(Date.now() + expiresIn),
        },
      });

      logger.info('User registered', { userId: user.id, email: user.email, role: user.role });

      return reply.code(201).send({
        id: user.id,
        email: user.email,
        role: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
        created_at: user.createdAt.toISOString(),
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
          detail: error.errors.map(e => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // Account lockout constants
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION_SECONDS = 900; // 15 minutes

  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Account lockout check (Redis-based)
      const lockoutKey = `login:lockout:${body.email}`;
      const attemptsKey = `login:attempts:${body.email}`;

      if (fastify.redis) {
        const lockoutTtl = await fastify.redis.ttl(lockoutKey);
        if (lockoutTtl > 0) {
          throw new AppError(429, 'account-locked', `Account temporarily locked. Try again in ${Math.ceil(lockoutTtl / 60)} minutes`);
        }
      }

      // Find user
      const user = await fastify.prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        // Increment failed attempts even for non-existent users (prevent enumeration)
        if (fastify.redis) {
          const attempts = await fastify.redis.incr(attemptsKey);
          await fastify.redis.expire(attemptsKey, LOCKOUT_DURATION_SECONDS);
          if (attempts >= MAX_LOGIN_ATTEMPTS) {
            await fastify.redis.set(lockoutKey, '1', 'EX', LOCKOUT_DURATION_SECONDS);
          }
        }
        throw new AppError(401, 'invalid-credentials', 'Invalid email or password');
      }

      if (user.status !== 'ACTIVE') {
        throw new AppError(403, 'account-suspended', 'Account is suspended or deactivated');
      }

      // Verify password
      const isValid = await verifyPassword(body.password, user.passwordHash);
      if (!isValid) {
        // Track failed login attempt
        if (fastify.redis) {
          const attempts = await fastify.redis.incr(attemptsKey);
          await fastify.redis.expire(attemptsKey, LOCKOUT_DURATION_SECONDS);
          if (attempts >= MAX_LOGIN_ATTEMPTS) {
            await fastify.redis.set(lockoutKey, '1', 'EX', LOCKOUT_DURATION_SECONDS);
            logger.warn('Account locked due to too many failed login attempts', { email: body.email });
          }
        }
        throw new AppError(401, 'invalid-credentials', 'Invalid email or password');
      }

      // Successful login — clear failed attempts
      if (fastify.redis) {
        await fastify.redis.del(attemptsKey, lockoutKey);
      }

      // Generate tokens
      const accessToken = fastify.jwt.sign(
        { userId: user.id, role: user.role, jti: randomUUID() },
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
      );

      const refreshToken = fastify.jwt.sign(
        { userId: user.id, type: 'refresh', jti: randomUUID() },
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
      );

      // Store session
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days
      await fastify.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          deviceInfo: (request.headers['user-agent'] as string) || 'unknown',
          ipAddress: request.ip || 'unknown',
          expiresAt: new Date(Date.now() + expiresIn),
        },
      });

      logger.info('User logged in', { userId: user.id, email: user.email });

      return reply.send({
        id: user.id,
        email: user.email,
        role: user.role,
        access_token: accessToken,
        refresh_token: refreshToken,
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
          detail: error.errors.map(e => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // POST /api/v1/auth/refresh
  // Implements refresh-token rotation: old token is invalidated, new pair issued.
  fastify.post('/refresh', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);

      // Hash the provided refresh token to find the session
      const tokenHash = createHash('sha256').update(body.refresh_token).digest('hex');

      const session = await fastify.prisma.session.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!session) {
        throw new AppError(401, 'unauthorized', 'Invalid refresh token');
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        // Clean up expired session
        await fastify.prisma.session.delete({ where: { id: session.id } });
        throw new AppError(401, 'unauthorized', 'Refresh token has expired');
      }

      // Check user status
      if (session.user.status !== 'ACTIVE') {
        throw new AppError(403, 'account-suspended', 'Account is suspended or deactivated');
      }

      // Delete old session (rotation: old token can never be reused)
      await fastify.prisma.session.delete({ where: { id: session.id } });

      // Issue new token pair
      const newAccessToken = fastify.jwt.sign(
        { userId: session.user.id, role: session.user.role, jti: randomUUID() },
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
      );

      const newRefreshToken = fastify.jwt.sign(
        { userId: session.user.id, type: 'refresh', jti: randomUUID() },
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
      );

      // Create new session
      const newTokenHash = createHash('sha256').update(newRefreshToken).digest('hex');
      const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days
      await fastify.prisma.session.create({
        data: {
          userId: session.user.id,
          tokenHash: newTokenHash,
          deviceInfo: (request.headers['user-agent'] as string) || session.deviceInfo,
          ipAddress: request.ip || session.ipAddress,
          expiresAt: new Date(Date.now() + expiresIn),
        },
      });

      logger.info('Token refreshed', { userId: session.user.id });

      return reply.send({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
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
          detail: error.errors.map(e => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // DELETE /api/v1/auth/logout
  // Requires Bearer token auth. Deletes session (single or all).
  fastify.delete('/logout', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = logoutSchema.parse(request.body || {});

      if (body.all) {
        // Delete ALL sessions for this user
        await fastify.prisma.session.deleteMany({
          where: { userId: request.currentUser!.id },
        });
        logger.info('All sessions cleared', { userId: request.currentUser!.id });
      } else if (body.refresh_token) {
        // Delete the specific session matching this refresh token
        const tokenHash = createHash('sha256').update(body.refresh_token).digest('hex');
        await fastify.prisma.session.deleteMany({
          where: { tokenHash },
        });
        logger.info('Session deleted', { userId: request.currentUser!.id });
      } else {
        // No refresh token and not all - delete all sessions as fallback
        await fastify.prisma.session.deleteMany({
          where: { userId: request.currentUser!.id },
        });
      }

      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/auth/verify-email
  // Validates a token stored in Redis, sets user's emailVerified flag.
  // Rate limited to prevent brute-force token guessing.
  fastify.post('/verify-email', async (request, reply) => {
    try {
      // Per-IP rate limiting for email verification
      if (fastify.redis) {
        const rateLimitKey = `verify-email:ratelimit:${request.ip}`;
        const attempts = await fastify.redis.incr(rateLimitKey);
        if (attempts === 1) {
          await fastify.redis.expire(rateLimitKey, 60);
        }
        if (attempts > 10) {
          throw new AppError(429, 'rate-limited', 'Too many verification attempts. Try again later.');
        }
      }

      const body = verifyEmailSchema.parse(request.body);

      // Hash the verification token to look up in Redis
      const tokenHash = createHash('sha256').update(body.token).digest('hex');

      if (!fastify.redis) {
        throw new AppError(500, 'service-unavailable', 'Email verification service is unavailable');
      }

      // Look up token in Redis
      const userId = await fastify.redis.get(`email-verify:${tokenHash}`);

      if (!userId) {
        throw new AppError(400, 'invalid-token', 'Invalid or expired verification token');
      }

      // Delete the token so it can't be reused
      await fastify.redis.del(`email-verify:${tokenHash}`);

      // Update user's emailVerified flag
      const user = await fastify.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      });

      logger.info('Email verified', { userId: user.id, email: user.email });

      return reply.send({
        message: 'Email verified successfully',
        email: user.email,
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
          detail: error.errors.map(e => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });
};

export default authRoutes;
