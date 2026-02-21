import app from "./app";

const PORT = parseInt(process.env.PORT || "3001", 10);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
