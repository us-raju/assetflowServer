const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.port || 3000;
require("dotenv").config();

// middlewire
app.use(cors());
app.use(express.json());

// mongodb uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.crlszhi.mongodb.net/?appName=Cluster0`;

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
    const database = client.db("AssetFlowUser");
    const packageCollection = database.collection("subcriptionPackage");
    const userCollection = database.collection("user");
    const assetCollection = database.collection("asset");

    // subcription package related apis here
    app.get("/subcriptionPackage", async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });

    // user related apis
    app.post("/user", async (req, res) => {
      const userData = req.body;
      const { email } = req.body;
      const existingUser = await userCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).send({
          message: "User already exists with this email",
        });
      }
      const newUser = {
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // login related apis

    app.post("/login", async (req, res) => {
      const { email } = req.body;
      const user = await userCollection.findOne({ email });
      if (!user) {
        return res.status(404).send({
          message: "User not registered",
        });
      }
      res.send(user);
    });

    // asset related apis
    app.post("/asset", async (req, res) => {
      const assetInfo = req.body;
      const result = await assetCollection.insertOne(assetInfo);
      res.send(result);
    });

    app.get("/asset", async (req, res) => {
      const result = await assetCollection.find().toArray();
      res.send(result);
    });

    app.patch("/asset/:id", async (req, res) => {
      const productId = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(productId) };
      const update = {
        $set:updatedData,
      };
      const result = await assetCollection.updateOne(query, update);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello world");
});

app.listen(port, () => {
  console.log("server is running port:6000");
});
