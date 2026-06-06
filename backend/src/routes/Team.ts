import express from 'express';
import controller from '../controllers/Team';

const router = express.Router();

router.post('/create', controller.createTeam);
router.get('/:teamName', controller.readTeam);
router.get('/', controller.readAll);
router.patch('/update/:teamName', controller.updateTeam);
router.patch('/update-by-id/:teamId', controller.updateTeamById);

export default router;
