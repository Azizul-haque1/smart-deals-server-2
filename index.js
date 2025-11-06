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

const logger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
};

// Firebase Admin Initialization
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);
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
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.apltpns.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("smart_db");
    const productsCollection = db.collection("products"); // fixed typo: produts → products
    const bidsCollection = db.collection("bids");
    const userCollection = db.collection("users");

    // Users API
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const existingUser = await userCollection.findOne({
        email: newUser.email,
      });
      if (existingUser) {
        return res.send({ message: "User already exists." });
      }
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // JWT Token API
    app.post("/getToken", (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Products APIs
    app.post("/products", verifyFirebaseToken, async (req, res) => {
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    app.get("/products", async (req, res) => {
      const query = {};
      if (req.query.email) query.email = req.query.email;
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updated = req.body;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updated }
      );
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/latest-products", async (req, res) => {
      const result = await productsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Bids APIs
    app.get("/bids", logger, verifyFirebaseToken, async (req, res) => {
      const query = {};
      const email = req.query.email;
      if (email) {
        if (email !== req.token_email)
          return res.status(403).send({ message: "Forbidden access" });
        query.buyer_email = email;
      }
      const result = await bidsCollection.find(query).sort({}).toArray();
      res.send(result);
    });

    app.get(
      "/products/bids/:productID",
      verifyFirebaseToken,
      async (req, res) => {
        const productID = req.params.productID;
        const result = await bidsCollection
          .find({ product: productID })
          .sort({ bid_price: -1 })
          .toArray();
        res.send(result);
      }
    );

    app.post("/bids", async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    app.delete("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const result = await bidsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    console.log("✅ Connected to MongoDB!");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
run().catch(console.dir);

// Root API
app.get("/", (req, res) => res.send("Smart server is running"));

// Export for Vercel
module.exports = app;
