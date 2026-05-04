// db.js
const { MongoClient } = require("mongodb");

const MONGO_URI = "mongodb+srv://jercahill:Spacebook2026@spacebook.mpqjbcv.mongodb.net/spacebook?retryWrites=true&w=majority";

const client = new MongoClient(MONGO_URI);

let db;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("spacebook"); // db name from your URI
    console.log("Connected to MongoDB (spacebook)");
  }
  return db;
}

module.exports = { client, connectDB };