require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/meeting_cost_calculator";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const attendeeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    hourlyCost: { type: Number, min: 0, required: true },
    availability: {
      type: String,
      enum: ["full-time", "part-time"],
      default: "full-time"
    }
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    agenda: { type: String, trim: true, required: true },
    lengthMinutes: { type: Number, min: 1, required: true },
    attendees: { type: [attendeeSchema], validate: (list) => list.length > 0 },
    totalCost: { type: Number, min: 0, required: true },
    recommendation: {
      verdict: { type: String, required: true },
      message: { type: String, required: true },
      score: { type: Number, required: true }
    }
  },
  { timestamps: true }
);

const Meeting = mongoose.model("Meeting", meetingSchema);

let mongoReady = false;

mongoose
  .connect(mongoUri, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    mongoReady = true;
    console.log("MongoDB connected");
  })
  .catch((error) => {
    mongoReady = false;
    console.warn("MongoDB not connected:", error.message);
  });

function cleanAttendees(attendees) {
  if (!Array.isArray(attendees)) return [];

  return attendees
    .map((person) => ({
      name: String(person.name || "").trim(),
      hourlyCost: Number(person.hourlyCost),
      availability:
        person.availability === "part-time" ? "part-time" : "full-time"
    }))
    .filter((person) => person.name && Number.isFinite(person.hourlyCost));
}

function calculateTotalCost(attendees, lengthMinutes) {
  const hours = lengthMinutes / 60;

  return attendees.reduce((sum, person) => {
    const partTimeMultiplier = person.availability === "part-time" ? 0.5 : 1;
    return sum + person.hourlyCost * partTimeMultiplier * hours;
  }, 0);
}

function getRecommendation(agenda, totalCost, lengthMinutes, peopleCount) {
  const text = agenda.trim().toLowerCase();
  let score = 0;

  if (text.length >= 12) score += 1;
  if (/\b(decide|approve|resolve|plan|assign|review|launch|budget|risk)\b/.test(text)) {
    score += 2;
  }
  if (/\b(update|sync|status|catch up|general)\b/.test(text)) score -= 1;
  if (totalCost <= 50) score += 2;
  else if (totalCost <= 150) score += 1;
  else if (totalCost > 300) score -= 2;
  else score -= 1;
  if (lengthMinutes > 60) score -= 1;
  if (peopleCount > 6) score -= 1;

  if (score >= 3) {
    return {
      verdict: "Worth it",
      message: "The agenda sounds action-focused and the cost looks reasonable.",
      score
    };
  }

  if (score >= 1) {
    return {
      verdict: "Maybe",
      message: "Keep it tight, invite only essential people, and leave with decisions.",
      score
    };
  }

  return {
    verdict: "Rethink it",
    message: "The cost or agenda looks weak. Consider an async update or shorter meeting.",
    score
  };
}

function validateMeeting(payload) {
  const agenda = String(payload.agenda || "").trim();
  const lengthMinutes = Number(payload.lengthMinutes);
  const attendees = cleanAttendees(payload.attendees);

  if (!agenda) return { error: "Agenda is required." };
  if (!Number.isFinite(lengthMinutes) || lengthMinutes <= 0) {
    return { error: "Meeting length must be greater than 0 minutes." };
  }
  if (!attendees.length) return { error: "Add at least one person." };
  if (attendees.some((person) => person.hourlyCost < 0)) {
    return { error: "Hourly cost cannot be negative." };
  }

  const totalCost = Number(calculateTotalCost(attendees, lengthMinutes).toFixed(2));
  const recommendation = getRecommendation(
    agenda,
    totalCost,
    lengthMinutes,
    attendees.length
  );

  return { agenda, lengthMinutes, attendees, totalCost, recommendation };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mongoReady });
});

app.post("/api/recommendation", (req, res) => {
  const meeting = validateMeeting(req.body);
  if (meeting.error) return res.status(400).json({ error: meeting.error });

  res.json({
    totalCost: meeting.totalCost,
    recommendation: meeting.recommendation
  });
});

app.get("/api/meetings", async (req, res) => {
  if (!mongoReady) {
    return res.json({
      mongoReady,
      meetings: []
    });
  }

  try {
    const meetings = await Meeting.find().sort({ createdAt: -1 }).lean();

    res.json({ mongoReady, meetings });
  } catch (error) {
    res.status(500).json({ error: "Could not load saved meetings." });
  }
});

app.post("/api/meetings", async (req, res) => {
  const meeting = validateMeeting(req.body);
  if (meeting.error) return res.status(400).json({ error: meeting.error });
  if (!mongoReady) {
    return res.status(503).json({
      error: "MongoDB is not connected. Start MongoDB or set MONGODB_URI."
    });
  }

  try {
    const saved = await Meeting.create(meeting);
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: "Could not save meeting." });
  }
});

app.put("/api/meetings/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid meeting id." });
  }

  const meeting = validateMeeting(req.body);
  if (meeting.error) return res.status(400).json({ error: meeting.error });
  if (!mongoReady) {
    return res.status(503).json({
      error: "MongoDB is not connected. Start MongoDB or set MONGODB_URI."
    });
  }

  try {
    const updated = await Meeting.findByIdAndUpdate(req.params.id, meeting, {
      new: true,
      runValidators: true
    });

    if (!updated) return res.status(404).json({ error: "Meeting not found." });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Could not update meeting." });
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(port, () => {
  console.log(`Meeting Cost Calculator running at http://localhost:${port}`);
});
