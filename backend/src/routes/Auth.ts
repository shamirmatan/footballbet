import express from 'express';
import controller from '../controllers/Auth';

const router = express.Router();

router.post('/verify', controller.verify);
router.get('/admins', controller.listAdmins);

export default router;
