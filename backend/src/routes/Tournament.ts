import express from 'express';
import {getTournament} from '../controllers/Tournament';

const router = express.Router();

router.get('/', getTournament);

export default router;
