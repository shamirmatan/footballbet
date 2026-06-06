import {Request, Response, NextFunction} from 'express';
import admin from '../config/firebase';
import AdminUser from '../models/AdminUser';

export interface AuthRequest extends Request {
  user?: {email: string; uid: string};
}

const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({message: 'Missing auth token'});
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email;
    if (!email) {
      return res.status(401).json({message: 'No email in token'});
    }

    const adminUser = await AdminUser.findOne({email: email.toLowerCase()});
    if (!adminUser) {
      return res.status(403).json({message: 'Not authorized'});
    }

    req.user = {email, uid: decoded.uid};
    next();
  } catch {
    return res.status(401).json({message: 'Invalid token'});
  }
};

export default requireAdmin;
