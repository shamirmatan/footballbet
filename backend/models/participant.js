const mongoose = require('mongoose')

const teamSchema = mongoose.Schema({
  name: String,
  games: Number,
  wins: Number,
  losses: Number,
  draws: Number,
  points: Number,
  qualifications: Number,
});

const participantSchema = mongoose.Schema({
  firstName: {type: String, required: true},
  lastName: {type: String, required: true},
  teams: {type: [teamSchema], required: true},
  position: {type: Number, required: true},
  points: {type: Number, required: true},
});

module.exports = mongoose.model('Participant', participantSchema);
