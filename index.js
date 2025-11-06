const express = require("express");
require("dotenv").config();
const cors = require("cors");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

// index.js
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log("logging information");
  next();
};

// const verifyFirebaseToken = async (req, res, next) => {
//   // console.log("in the verify middleware", req.headers.authorization);

//   if (!req.headers.authorization) {
//     return res.status(401).send({ mesage: "unauthorized access" });
//   }

//   const token = req.headers.authorization.split(" ")[1];
//   if (!token) {
//     return res.status(401).send({ mesage: "unauthorized access" });
//   }

//   try {
//     const userInfo = await admin.auth().verifyIdToken(token);
//     req.token_email = userInfo.email;
//     next();
//     console.log("after token validation", userInfo);
//   } catch {
//     return res.status(401).send({ mesage: "unauthorized access" });
//   }
// };

// jwt token verify

const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    next();
    console.log("verify token", decoded);
  } catch (error) {
    // console.log(error);
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const varifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.token_email = decoded.email;

    next();
  });
};
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.apltpns.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
    const productsCollection = db.collection("produts");
    const bidsCollection = db.collection("bids");
    const userCollection = db.collection("users");

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = userCollection.findOne(query);
      if (existingUser) {
        res.send({
          message: "user already exist. do not need to to insert again",
        });
      } else {
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // jwt releted api
    app.post("/getToken", (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token: token });
    });

    app.post("/products", verifyFirebaseToken, async (req, res) => {
      console.log("header in the post", req.token_email);
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    app.get("/products", async (req, res) => {
      // const projectFields = { title: 1 };
      // const cursor = productsCollection
      //   .find()

      //   .sort({ price_min: -1 })
      //   .skip(4);
      // // .project(projectFields);
      console.log(req.query);
      const query = {};
      const email = req.query.email;
      if (email) {
        query.email = email;
      }

      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };

      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // latest products

    app.get("/latest-products", async (req, res) => {
      const cursor = productsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // app.get("/bids", varifyToken, async (req, res) => {
    //   console.log("headers", req.headers);
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.buyer_email = email;
    //   }

    //   // varify user have  access to  see this data
    //   if (email !== req.token_email) {
    //     return res.status(403).send({ message: "forbidden access" });
    //   }

    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // bids firebase related apis with firebase token verify

    app.get("/bids", logger, verifyFirebaseToken, async (req, res) => {
      console.log(req.headers);
      const email = req.query.email;
      const query = {};
      if (email) {
        if (email !== req.token_email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        query.buyer_email = email;
      }
      const cursor = bidsCollection.find(query).sort({});
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await bidsCollection.findOne(query);
      res.send(result);
    });

    app.get(
      "/products/bids/:productID",
      verifyFirebaseToken,
      async (req, res) => {
        const productID = req.params.productID;
        const query = { product: productID };
        const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
        const result = await cursor.toArray();
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
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("smart server is running");
});
module.exports = app;

// app.listen(port, () => {
//   console.log("Smart server is  running on port", port);
// });

// client
//   .connect()
//   .then(() => {
//     app.listen(port, () => {
//       console.log("Smart server is  now running on port", port);
//     });
//   })
//   .catch(console.dir);
