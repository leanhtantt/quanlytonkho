import { AuthRequest } from '../middlewares/authMiddleware';
import { writeActivityLog } from './activityLogService';

const seenLoginSessions = new Map<string, number>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function removeExpiredSessions(now: number) {
  for (const [key, expiresAt] of seenLoginSessions) {
    if (expiresAt <= now) seenLoginSessions.delete(key);
  }
}

export async function writeLoginActivityOnce(req: AuthRequest) {
  const user = req.user;
  if (!user) return;

  const now = Date.now();
  removeExpiredSessions(now);
  const sessionMarker = user.auth_time ?? user.iat ?? now;
  const key = `${user.uid}:${sessionMarker}`;
  if (seenLoginSessions.has(key)) return;

  seenLoginSessions.set(key, now + SESSION_TTL_MS);
  try {
    await writeActivityLog({
      action: 'login',
      resource: 'auth',
      targetId: user.uid,
      targetLabel: user.email ?? user.uid,
      after: { isAdmin: req.isAdmin === true },
    });
  } catch (error) {
    seenLoginSessions.delete(key);
    throw error;
  }
}
