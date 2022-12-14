import express from 'express';
import controller from '../controllers/Participant';

const router = express.Router();

router.post('/create', controller.createParticipant);
router.get('/:participantLastName', controller.readParticipant);
router.get('/', controller.readAll);
router.patch('/update/:participantLastName', controller.updateParticipant);
export default router;
