import express from 'express';
import {getMatches} from '../controllers/Matches';

const router = express.Router();

router.get('/', getMatches);

export default router;
