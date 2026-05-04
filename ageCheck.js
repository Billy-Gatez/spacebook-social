// routes/ageCheck.js
import express from "express";
import { db } from "../db.js";

const router = express.Router();
const collection = db.collection("ageChecks");

router.post("/api/age-check", async (req, res) => {
  try {
    const { dob, age, clientInfo } = req.body || {};

    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket.remoteAddress ||
      null;

    await collection.insertOne({
      dob,
      age,
      clientInfo,
      ip,
      createdAt: new Date(),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("age-check error", err);
    res.status(500).json({ ok: false });
  }
});

export default router;