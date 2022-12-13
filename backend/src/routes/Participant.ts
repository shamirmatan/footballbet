import express from 'express';
import controller from '../controllers/Participant';

const router = express.Router();

router.post('/create', controller.createParticipant);
router.get('/:participantId', controller.readParticipant);
router.get('/', controller.readAll);
router.patch('/update/:participantId', controller.updateParticipant);

export = router;
