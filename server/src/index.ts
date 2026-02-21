import path from "path";
import express from "express";
import app from "./app";

const PORT = parseInt(process.env.PORT || "5173", 10);

// Serve the built client
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// SPA fallback: serve index.html for any non-API route
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
