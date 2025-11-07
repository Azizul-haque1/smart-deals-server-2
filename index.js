// index.js
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
try {
  const decoded = Buffer.from(
    process.env.FIREBASE_SERVICE_KEY,
    "base64"
  ).toString("utf8");
  const serviceAccount = JSON.parse(decoded);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase initialized");
} catch (err) {
  console.error("❌ Firebase initialization error:", err);
}

// JWT verification middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization)
    return res.status(401).send({ message: "Unauthorized access" });

  const token = authorization.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
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
    req.token_email = decoded.email;
    next();
  });
};

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.apltpns.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let productsCollection, bidsCollection, usersCollection;

async function connectDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB");

    const db = client.db(process.env.DB_NAME);
    productsCollection = db.collection("products");
    bidsCollection = db.collection("bids");
    usersCollection = db.collection("users");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
connectDB();

// ------------------- ROUTES ------------------- //

// Root
app.get("/", (req, res) => res.send("Smart server is running"));

// Users
app.post("/users", async (req, res) => {
  try {
    const newUser = req.body;
    const existingUser = await usersCollection.findOne({
      email: newUser.email,
    });
    if (existingUser) return res.send({ message: "User already exists." });

    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Database error" });
  }
});

// JWT Token
app.post("/getToken", (req, res) => {
  try {
    const loggedUser = req.body;
    const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.send({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Token generation failed" });
  }
});

// Products
app.post("/products", verifyFirebaseToken, async (req, res) => {
  try {
    const newProduct = { ...req.body, created_at: new Date() };
    const result = await productsCollection.insertOne(newProduct);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create product" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const query = req.query.email ? { email: req.query.email } : {};
    const result = await productsCollection.find(query).toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch products" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await productsCollection.findOne({ _id: new ObjectId(id) });
    if (!result) return res.status(404).send({ message: "Product not found" });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch product" });
  }
});

app.patch("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updated = req.body;
    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updated }
    );
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update product" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await productsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete product" });
  }
});

app.get("/latest-products", async (req, res) => {
  try {
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

// Bids
app.get("/bids", verifyFirebaseToken, async (req, res) => {
  try {
    const query = {};
    const email = req.query.email;
    if (email) {
      if (email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });
      query.buyer_email = email;
    }
    const result = await bidsCollection.find(query).toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch bids" });
  }
});

app.get("/products/bids/:productID", verifyFirebaseToken, async (req, res) => {
  try {
    const productID = req.params.productID;
    const result = await bidsCollection
      .find({ product: productID })
      .sort({ bid_price: -1 })
      .toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch product bids" });
  }
});

app.post("/bids", async (req, res) => {
  try {
    const newBid = req.body;
    const result = await bidsCollection.insertOne(newBid);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create bid" });
  }
});

app.delete("/bids/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await bidsCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete bid" });
  }
});

// Export for Vercel
module.exports = app;
