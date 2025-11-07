const express = require("express");
require("dotenv").config();
const cors = require("cors");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin Initialization
const decodedFirebaseKey = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decodedFirebaseKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// JWT verification middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization)
    return res.status(401).send({ message: "Unauthorized access" });

  const token = authorization.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebase_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

const verifyJWTToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization)
    return res.status(401).send({ message: "Unauthorized access" });

  const token = authorization.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized access" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized access" });
    req.jwt_email = decoded.email;
    next();
  });
};

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.apltpns.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let productsCollection, bidsCollection, usersCollection;

// Connect to MongoDB
async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "smart_db");
    productsCollection = db.collection("products");
    bidsCollection = db.collection("bids");
    usersCollection = db.collection("users");
    console.log("✅ Connected to MongoDB");
  }
}

// Routes

app.get("/", (req, res) => res.send("Smart server is running"));

// Latest products
app.get("/latest-products", async (req, res) => {
  try {
    await connectDB();
    const result = await productsCollection
      .find()
      .sort({ created_at: -1 })
      .limit(6)
      .toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch latest products" });
  }
});

// Products routes
app.post("/products", verifyFirebaseToken, async (req, res) => {
  try {
    await connectDB();
    const result = await productsCollection.insertOne(req.body);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to add product" });
  }
});

app.get("/products", async (req, res) => {
  try {
    await connectDB();
    const query = {};
    if (req.query.email) query.email = req.query.email;
    const result = await productsCollection.find(query).toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch products" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    await connectDB();
    const result = await productsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch product" });
  }
});

// Users routes
app.post("/users", async (req, res) => {
  try {
    await connectDB();
    const newUser = req.body;
    const existingUser = await usersCollection.findOne({
      email: newUser.email,
    });
    if (existingUser) return res.send({ message: "User already exists." });

    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create user" });
  }
});

// JWT route
app.post("/getToken", (req, res) => {
  const loggedUser = req.body;
  const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

// Bids routes
app.get("/bids", verifyFirebaseToken, async (req, res) => {
  try {
    await connectDB();
    const query = {};
    const email = req.query.email;
    if (email) {
      if (email !== req.firebase_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      query.buyer_email = email;
    }
    const result = await bidsCollection.find(query).sort({}).toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch bids" });
  }
});

app.post("/bids", async (req, res) => {
  try {
    await connectDB();
    const result = await bidsCollection.insertOne(req.body);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create bid" });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

module.exports = app;
