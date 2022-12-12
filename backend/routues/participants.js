const express = require('express')
const router = express.Router()

const ParticipantsController = require('../controllers/participants')
const CorsMiddleware = require('../middlewares/cors')

router.get('', CorsMiddleware.set, ParticipantsController.getParticipants);

module.exports = router;
