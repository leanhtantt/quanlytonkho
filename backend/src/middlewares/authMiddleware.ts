import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

// Initialize Firebase Admin (requires GOOGLE_APPLICATION_CREDENTIALS in env)
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

// Extend Express Request type to include the decoded token
export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};
