import express from 'express';
import controller from '../controllers/Participant';
import requireAdmin from '../middleware/auth';

const router = express.Router();

router.post('/create', controller.createParticipant);
router.get('/:participantLastName', controller.readParticipant);
router.get('/', controller.readAll);
router.patch('/update/:participantLastName', requireAdmin, controller.updateParticipant);
export default router;
