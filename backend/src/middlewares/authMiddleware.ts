import { NextFunction, Request, RequestHandler, Response } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { prisma } from '../prismaClient';

if (!getApps().length) {
  initializeApp({
    projectId: 'tanle-dev',
  });
}

export type PermissionAction = 'view' | 'create' | 'update' | 'delete';
export type PermissionMap = Record<string, string[]>;

export interface AuthorizedUserRecord {
  id: string;
  email: string;
  role: string;
  permissions: PermissionMap;
  isActive: boolean;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  isAdmin?: boolean;
  userRecord?: AuthorizedUserRecord;
}

interface UserCacheEntry {
  value: AuthorizedUserRecord | null;
  expiresAt: number;
}

const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, UserCacheEntry>();

function normalizePermissions(value: unknown): PermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const permissions: PermissionMap = {};
  for (const [resource, actions] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(actions)) {
      permissions[resource] = actions.filter(
        (action): action is string => typeof action === 'string'
      );
    }
  }
  return permissions;
}

async function getCachedUser(uid: string): Promise<AuthorizedUserRecord | null> {
  const now = Date.now();
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > now) return cached.value;

  if (cached) userCache.delete(uid);

  const record = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      id: true,
      email: true,
      role: true,
      permissions: true,
      isActive: true,
    },
  });

  const value = record
    ? { ...record, permissions: normalizePermissions(record.permissions) }
    : null;
  userCache.set(uid, { value, expiresAt: now + USER_CACHE_TTL_MS });
  return value;
}

export function clearUserAuthorizationCache(uid?: string) {
  if (uid) userCache.delete(uid);
  else userCache.clear();
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  req.user = decodedToken;
  req.isAdmin = decodedToken.admin === true;

  if (req.isAdmin) return next();

  try {
    const userRecord = await getCachedUser(decodedToken.uid);
    if (!userRecord) {
      return res.status(403).json({
        error: 'Forbidden: Tài khoản chưa được quản trị viên cấp quyền.',
      });
    }
    if (!userRecord.isActive) {
      return res.status(403).json({
        error: 'Forbidden: Tài khoản đã bị vô hiệu hóa.',
      });
    }

    req.userRecord = userRecord;
    return next();
  } catch (error) {
    console.error('Error loading authorization record:', error);
    return res.status(500).json({ error: 'Internal server error: Không thể kiểm tra quyền tài khoản.' });
  }
};

export function requirePermission(resource: string, action: PermissionAction): RequestHandler {
  return (req, res, next) => {
    const authReq = req as AuthRequest;
    if (authReq.isAdmin === true) return next();

    const allowedActions = authReq.userRecord?.permissions[resource];
    if (Array.isArray(allowedActions) && allowedActions.includes(action)) {
      return next();
    }

    return res.status(403).json({
      error: `Forbidden: Không có quyền ${action} trên ${resource}.`,
    });
  };
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if ((req as AuthRequest).isAdmin === true) return next();

  return res.status(403).json({
    error: 'Forbidden: Chỉ quản trị viên được phép thực hiện thao tác này.',
  });
};
