import { RequestHandler, Response, Router } from 'express';
import { getAuth, UpdateRequest, UserRecord } from 'firebase-admin/auth';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest, clearUserAuthorizationCache } from '../middlewares/authMiddleware';
import { prisma } from '../prismaClient';

const roles = ['manager', 'staff', 'viewer'] as const;
const resources = [
  'dashboard',
  'purchases',
  'products',
  'orders',
  'losses',
  'profit',
  'treasury',
  'settings',
  'users',
  'activity',
] as const;
const actions = ['view', 'create', 'update', 'delete'] as const;

const roleSchema = z.enum(roles);
const actionSchema = z.enum(actions);
const allowedResources = new Set<string>(resources);

const permissionActionsSchema = z.array(actionSchema).superRefine((value, ctx) => {
  if (new Set(value).size !== value.length) {
    ctx.addIssue({ code: 'custom', message: 'Một action không được lặp lại.' });
  }
});

const permissionsSchema = z
  .record(z.string(), permissionActionsSchema)
  .superRefine((value, ctx) => {
    for (const resource of Object.keys(value)) {
      if (!allowedResources.has(resource)) {
        ctx.addIssue({
          code: 'custom',
          path: [resource],
          message: `Resource không hợp lệ: ${resource}.`,
        });
      }
    }
  });

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().max(100).nullable().optional(),
  role: roleSchema,
  permissions: permissionsSchema.default({}),
}).strict();

const updateUserSchema = z.object({
  displayName: z.string().trim().max(100).nullable().optional(),
  role: roleSchema.optional(),
  permissions: permissionsSchema.optional(),
  isActive: z.boolean().optional(),
}).strict().refine(
  value => Object.keys(value).length > 0,
  { message: 'Cần ít nhất một trường để cập nhật.' }
);

const resetPasswordSchema = z.object({
  password: z.string().min(6).max(128),
}).strict();

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const editableUserSelect = {
  ...publicUserSelect,
  permissions: true,
} satisfies Prisma.UserSelect;

function normalizeDisplayName(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value && value.length > 0 ? value : null;
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String(error.code);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isCredentialError(error: unknown) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  return code === 'app/invalid-credential'
    || code === 'auth/insufficient-permission'
    || /credential|permission/i.test(message);
}

function sendFirebaseError(res: Response, error: unknown, action: string) {
  const code = getErrorCode(error);
  if (code === 'auth/email-already-exists') {
    return res.status(409).json({ error: 'Email đã tồn tại trong Firebase Authentication.' });
  }
  if (code === 'auth/user-not-found') {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản Firebase.' });
  }
  if (isCredentialError(error)) {
    return res.status(503).json({
      error: 'Firebase Admin chưa có credentials hợp lệ hoặc thiếu quyền Firebase Authentication Admin.',
    });
  }

  console.error(`Firebase Admin error while ${action}:`, error);
  return res.status(500).json({ error: `Không thể ${action} trên Firebase Authentication.` });
}

function getTargetUid(req: AuthRequest) {
  const uid = req.params.uid;
  return typeof uid === 'string' ? uid.trim() : '';
}

function isAdminUser(user: UserRecord) {
  return user.customClaims?.admin === true;
}

export const listUsers: RequestHandler = async (_req, res) => {
  const users = await prisma.user.findMany({
    select: publicUserSelect,
    orderBy: [{ createdAt: 'desc' }, { email: 'asc' }],
  });
  res.json(users);
};

export const createUser: RequestHandler = async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const authReq = req as AuthRequest;
  const adminUid = authReq.user?.uid;
  if (!adminUid) {
    return res.status(403).json({ error: 'Forbidden: Thiếu thông tin quản trị viên.' });
  }

  const data = parsed.data;
  const displayName = normalizeDisplayName(data.displayName);
  let firebaseUser: UserRecord;

  try {
    firebaseUser = await getAuth().createUser({
      email: data.email,
      password: data.password,
      ...(displayName ? { displayName } : {}),
      disabled: false,
    });
  } catch (error) {
    return sendFirebaseError(res, error, 'tạo user');
  }

  try {
    const user = await prisma.user.create({
      data: {
        id: firebaseUser.uid,
        email: firebaseUser.email || data.email,
        displayName: displayName ?? null,
        role: data.role,
        permissions: data.permissions,
        isActive: true,
        createdBy: adminUid,
      },
      select: editableUserSelect,
    });
    clearUserAuthorizationCache(firebaseUser.uid);
    return res.status(201).json(user);
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      await getAuth().deleteUser(firebaseUser.uid);
    } catch (rollbackError) {
      rollbackSucceeded = false;
      console.error('Không thể rollback Firebase user sau lỗi Prisma:', rollbackError);
    }

    console.error('Không thể lưu User vào PostgreSQL:', error);
    const status = getErrorCode(error) === 'P2002' ? 409 : 500;
    return res.status(status).json({
      error: rollbackSucceeded
        ? 'Không thể lưu user vào cơ sở dữ liệu; tài khoản Firebase đã được rollback.'
        : `Không thể lưu user và rollback Firebase. Cần xử lý thủ công UID ${firebaseUser.uid}.`,
    });
  }
};

export const updateUser: RequestHandler = async (req, res) => {
  const authReq = req as AuthRequest;
  const uid = getTargetUid(authReq);
  if (!uid) return res.status(400).json({ error: 'Firebase UID không hợp lệ.' });

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let firebaseUser: UserRecord;
  try {
    firebaseUser = await getAuth().getUser(uid);
  } catch (error) {
    return sendFirebaseError(res, error, 'đọc user');
  }

  if (isAdminUser(firebaseUser)) {
    return res.status(403).json({ error: 'Forbidden: Không được sửa tài khoản admin.' });
  }

  const existing = await prisma.user.findUnique({
    where: { id: uid },
    select: editableUserSelect,
  });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy User record.' });

  const data = parsed.data;
  const displayName = normalizeDisplayName(data.displayName);
  const activeChanged = data.isActive !== undefined && data.isActive !== existing.isActive;
  const firebaseUpdate: UpdateRequest = {};
  const firebaseRollback: UpdateRequest = {};

  if (displayName !== undefined) {
    firebaseUpdate.displayName = displayName;
    firebaseRollback.displayName = firebaseUser.displayName || null;
  }
  if (activeChanged) {
    firebaseUpdate.disabled = !data.isActive;
    firebaseRollback.disabled = firebaseUser.disabled;
  }

  if (Object.keys(firebaseUpdate).length > 0) {
    try {
      await getAuth().updateUser(uid, firebaseUpdate);
    } catch (error) {
      return sendFirebaseError(res, error, 'cập nhật user');
    }
  }

  let revokeError: unknown;
  if (activeChanged && data.isActive === false) {
    try {
      await getAuth().revokeRefreshTokens(uid);
    } catch (error) {
      revokeError = error;
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id: uid },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.permissions !== undefined ? { permissions: data.permissions } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      select: editableUserSelect,
    });
    clearUserAuthorizationCache(uid);

    if (revokeError) {
      console.error('Không thể revoke refresh token sau khi disable user:', revokeError);
      return res.status(502).json({
        error: 'User đã bị vô hiệu hóa và cache đã xóa, nhưng Firebase không revoke được refresh token.',
        user,
      });
    }

    return res.json(user);
  } catch (error) {
    if (Object.keys(firebaseRollback).length > 0) {
      try {
        await getAuth().updateUser(uid, firebaseRollback);
      } catch (rollbackError) {
        console.error('Không thể rollback cập nhật Firebase user:', rollbackError);
      }
    }
    console.error('Không thể cập nhật User record:', error);
    return res.status(500).json({ error: 'Không thể cập nhật User record.' });
  }
};

export const resetUserPassword: RequestHandler = async (req, res) => {
  const authReq = req as AuthRequest;
  const uid = getTargetUid(authReq);
  if (!uid) return res.status(400).json({ error: 'Firebase UID không hợp lệ.' });

  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let firebaseUser: UserRecord;
  try {
    firebaseUser = await getAuth().getUser(uid);
  } catch (error) {
    return sendFirebaseError(res, error, 'đọc user');
  }

  if (isAdminUser(firebaseUser)) {
    return res.status(403).json({ error: 'Forbidden: Không được đặt lại mật khẩu admin.' });
  }

  try {
    await getAuth().updateUser(uid, { password: parsed.data.password });
    clearUserAuthorizationCache(uid);
    return res.json({ success: true });
  } catch (error) {
    return sendFirebaseError(res, error, 'đặt lại mật khẩu');
  }
};

export const usersRouter = Router();

usersRouter.get('/', listUsers);
usersRouter.post('/', createUser);
usersRouter.put('/:uid', updateUser);
usersRouter.post('/:uid/reset-password', resetUserPassword);
