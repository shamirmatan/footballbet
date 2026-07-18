import express from 'express';
import {listTournaments} from '../controllers/Tournaments';

const router = express.Router();

router.get('/', listTournaments);

export default router;
