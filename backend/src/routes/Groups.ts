import express from 'express';
import {getGroups} from '../controllers/Groups';

const router = express.Router();

router.get('/', getGroups);

export default router;
