const { MongoClient } = require("mongodb");

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGO_DB_NAME || "mongolingo";

let client;
let db;

async function connectDb() {
  if (db) return db;

  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

async function closeDb() {
  if (!client) return;
  await client.close();
  client = undefined;
  db = undefined;
}

module.exports = {
  closeDb,
  connectDb,
  dbName,
  mongoUri,
};
