import express from 'express';
import controller from '../controllers/Update';

const router = express.Router();

router.post('/teams', controller.updateTeams);
router.post('/participants', controller.updateParticipants)
export default router;
