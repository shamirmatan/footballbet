import express from 'express';
import {getBracket} from '../controllers/Bracket';

const router = express.Router();

router.get('/', getBracket);

export default router;
