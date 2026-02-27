import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import contactRoutes from "./routes/contacts";
import groupRoutes from "./routes/groups";
import smsRoutes from "./routes/sms";
import voiceRoutes from "./routes/voice";
import orgRoutes from "./routes/org";
import notificationRoutes from "./routes/notifications";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/notifications", notificationRoutes);

// Error handler
app.use(errorHandler);

export default app;
