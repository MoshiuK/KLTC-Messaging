import "dotenv/config";
import path from "path";
import express from "express";
import app from "./app";

const PORT = parseInt(process.env.PORT || "5173", 10);

// Serve the built client (hashed assets can be cached, HTML cannot)
const clientDist = path.join(__dirname, "../../client/dist");
app.use("/assets", express.static(path.join(clientDist, "assets"), { maxAge: "1y" }));
app.use(express.static(clientDist, { etag: false, lastModified: false }));

// SPA fallback: serve index.html with no-cache headers
app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
