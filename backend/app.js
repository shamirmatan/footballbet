const express = require('express');
const app = express();
const mongoose = require("mongoose")
const Participant = require('./models/participant')

mongoose.connect("mongodb+srv://footballbet:Boy0S75q836VMl1K@cluster0.cdkdcng.mongodb.net/?retryWrites=true&w=majority").then(() => {
  console.log("Connected to database!");
})
  .catch(() => {
    console.log("Connection failed!");
  });

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );
  next();
});

app.get("/api/participants", (req, res, next) => {
  Participant.find().then(documents => {
    res.status(200).json({
      participants: documents
    });
  });
});

module.exports = app
