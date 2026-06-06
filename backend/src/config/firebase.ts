import admin from 'firebase-admin';
import AdminUser from '../models/AdminUser';
import Logging from '../library/Logging';

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccount))
  });
} else {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const SEED_ADMINS = ['matans8890@gmail.com'];

export async function seedAdmins() {
  for (const email of SEED_ADMINS) {
    const exists = await AdminUser.findOne({email});
    if (!exists) {
      await new AdminUser({email}).save();
      Logging.info(`Seeded admin: ${email}`);
    }
  }
}

export default admin;
