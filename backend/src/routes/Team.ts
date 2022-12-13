import express from 'express';
import controller from '../controllers/Team';

const router = express.Router();

router.post('/create', controller.createTeam);
router.get('/:teamId', controller.readTeam);
router.get('/', controller.readAll);
router.patch('/update/:teamId', controller.updateTeam);
export = router;
