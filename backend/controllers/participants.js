const Participant = require("../models/participant");

exports.getParticipants = (req, res) => {
  Participant.find().then(documents => {
    res.status(200).json({
      participants: documents
    });
  })};
