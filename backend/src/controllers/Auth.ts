import {Response} from 'express';
import {AuthRequest} from '../middleware/auth';
import AdminUser from '../models/AdminUser';
import admin from '../config/firebase';

const verify = async (req: AuthRequest, res: Response) => {
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
    return res.status(200).json({
      isAdmin: !!adminUser,
      email
    });
  } catch {
    return res.status(401).json({message: 'Invalid token'});
  }
};

export default {verify};
