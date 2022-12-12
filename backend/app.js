const express = require('express');
const app = express();
const mongoose = require("mongoose")
const participantsRoutes = require('./routues/participants')

mongoose.connect("mongodb+srv://footballbet:" + process.env.MONGO_ATLAS_PW + "@cluster0.cdkdcng.mongodb.net/?retryWrites=true&w=majority").then(() => {
  console.log("Connected to database!");
})
  .catch(() => {
    console.log("Connection failed!");
  });

// setInterval( () => {
//   console.log("Fetching on internal")
// }, 5000)


app.use('/api/participants', participantsRoutes)
module.exports = app
