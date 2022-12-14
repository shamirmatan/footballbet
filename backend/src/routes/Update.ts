import express from 'express';
import controller from '../controllers/Update';

const router = express.Router();

router.post('', controller.updateTeams);
export default router;
