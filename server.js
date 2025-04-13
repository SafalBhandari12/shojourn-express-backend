// server.js
require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware to parse JSON requests
app.use(express.json());

// Define routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/localmarketproduct", require("./routes/localmarket/localMarket"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
