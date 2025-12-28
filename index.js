const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.port || 3000;
require("dotenv").config();
const admin = require("firebase-admin");

const serviceAccount = require(process.env.FIREBASE_TOKEN);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middlewire
app.use(cors());
app.use(express.json());

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: `unauthorized access` });
  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    req.decoded_email = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    return res.status(401).send({ message: `unauthorized access` });
  }
};

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
    const requestCollection = database.collection("request");
    const assetAssginCollection = database.collection("assetAssgin");
    const employeeAffiliationsCollection = database.collection(
      "employeeAffiliations"
    );

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
        return res.send(existingUser);
      }
      const newUser = {
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await userCollection.insertOne(newUser);
      res.send({ result });
    });

    app.patch("/user/:email", async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;
      const update = {
        $set: updatedData,
      };
      const result = await userCollection.updateOne({ email }, update);
      res.send(result);
    });

    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
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
    app.post("/asset", verifyToken, async (req, res) => {
      const assetInfo = req.body;
      const result = await assetCollection.insertOne(assetInfo);
      res.send(result);
    });

    app.get("/asset/:email", verifyToken, async (req, res) => {
      const hrEmail = req.params.email;
      const { limit = 0, skip = 0 } = req.query;
      if (hrEmail !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      console.log(limit, skip);
      const result = await assetCollection
        .find({ hrEmail })
        .limit(Number(limit))
        .skip(Number(skip))
        .toArray();
      const totalCount = await assetCollection.countDocuments({ hrEmail });
      res.send({assets: result, totalCount });
    });
    app.get("/asset/", async (req, res) => {
      const result = await assetCollection.find().toArray();
      res.send(result);
    });

    app.patch("/asset/:id", verifyToken, async (req, res) => {
      const productId = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(productId) };
      const update = {
        $set: updatedData,
      };
      const result = await assetCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/asset/:id", verifyToken, async (req, res) => {
      const productId = req.params.id;
      const query = { _id: new ObjectId(productId) };
      const result = await assetCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/request", async (req, res) => {
      const requestData = req.body;
      const result = await requestCollection.insertOne(requestData);
      res.send(result);
    });

    app.get("/request", async (req, res) => {
      const email = req.query.email;
      const result = await requestCollection
        .find({
          hrEmail: email,
          requestStatus: "Pending",
        })
        .toArray();
      res.send(result);
    });

    app.post("/request/:id", async (req, res) => {
      const requestId = req.params.id;
      const { assetId } = req.body;
      const query = { _id: new ObjectId(requestId) };
      // request
      const request = await requestCollection.findOne(query);

      if (!request) {
        return res.status(404).send({ message: "Request not found" });
      }

      //  employee limit check
      const used = await employeeAffiliationsCollection.countDocuments({
        hrEmail: request.hrEmail,
        status: "active",
      });

      const Limit = await userCollection.findOne({
        hrEmail: request.hrEmail,
      });

      const max = Number(Limit?.employeeLimit) || 5;

      if (used >= max) {
        return res.status(403).send({
          message: "Employee limit reached. Upgrade your package.",
        });
      }

      const asset = await assetCollection.findOne({
        _id: new ObjectId(assetId),
      });
      if (!asset) {
        return res.status(404).send({ message: "Asset not found" });
      }
      if (asset.productQuantity <= 0) {
        return res.status(400).send({ message: "Asset stock out" });
      }

      if (request.requestStatus === "approved") {
        return res.status(400).send({ message: "Request already approved" });
      }
      // assetAssign
      const result = await assetAssginCollection.insertOne({
        assetId: asset._id,
        assetName: asset.productName,
        assetImage: asset.productImage,
        assetType: asset.productType,
        employeeEmail: request.requesterEmail,
        employeeName: request.requesterName,
        hrEmail: request.hrEmail,
        companyName: request.companyName,
        assignmentDate: new Date(),
        returnDate: null,
        status: "assigned",
      });

      // asset quantity
      const quantityUpdate = await assetCollection.updateOne(
        { _id: asset._id },
        { $inc: { productQuantity: -1 } }
      );

      // request approve

      await requestCollection.updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { requestStatus: "approved" } }
      );

      // employee affilitation existing checking

      const exists = await employeeAffiliationsCollection.findOne({
        employeeEmail: request.requesterEmail,
        hrEmail: request.hrEmail,
      });

      if (!exists) {
        await employeeAffiliationsCollection.insertOne({
          employeeEmail: request.requesterEmail,
          employeeName: request.requesterName,
          hrEmail: request.hrEmail,
          companyName: request.companyName,
          companyLogo: request.companyLogo,
          affiliationDate: new Date(),
          status: "active",
        });
        await userCollection.updateOne(
          { email: request.hrEmail },
          { $inc: { currentEmployees: 1 } }
        );
      }

      // const result = await requestCollection.updateOne(query, update);
      res.send(result);
    });

    app.patch("/request/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updatedData,
      };
      const result = requestCollection.updateOne(query, update);
      res.send(result);
    });

    // collection aggreation

    app.get("/myemployee", async (req, res) => {
      try {
        const email = req.query.email;
        const companyName = req.query.companyName;

        const employees = await assetAssginCollection
          .aggregate([
            { $match: { hrEmail: email, companyName: companyName } },
            {
              $lookup: {
                from: "user",
                localField: "employeeEmail",
                foreignField: "email",
                as: "employeeInfo",
              },
            },
            {
              $lookup: {
                from: "employeeAffiliations",
                localField: "employeeEmail",
                foreignField: "employeeEmail",
                as: "affiliation",
              },
            },
            { $unwind: "$affiliation" },
            { $match: { "affiliation.status": "active" } },
            {
              $group: {
                _id: "$employeeEmail",
                employeeName: { $first: "$employeeName" },
                EmployeeImage: {
                  $first: { $arrayElemAt: ["$employeeInfo.photoURL", 0] },
                },
                JoinedDate: { $first: "$assignmentDate" },
                AssetCount: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                employeeEmail: "$_id",
                employeeName: 1,
                EmployeeImage: 1,
                JoinedDate: 1,

                AssetCount: 1,
              },
            },
          ])
          .toArray();

        res.send(employees);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // employeelimit releted apis

    app.get("/employee-usage", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ message: "Email required" });
        }

        const used = await employeeAffiliationsCollection.countDocuments({
          hrEmail: email,
          status: "active",
        });

        const LIMIT = await userCollection.findOne({
          hrEmail: email,
        });

        const max = LIMIT?.employeeLimit || 5;

        res.send({
          used,
          max,
          remaining: Math.max(max - used, 0),
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // asset assigned apis
    app.get("/assetAssgin", async (req, res) => {
      const email = req.query.email;
      const query = { employeeEmail: email };
      const result = await assetAssginCollection.find(query).toArray();
      res.send(result);
    });

    // team releted api
    app.get("/my-team", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email Undefined" });
      }
      const result = await employeeAffiliationsCollection
        .aggregate([
          {
            $match: {
              employeeEmail: email,
              status: "active",
            },
          },

          {
            $lookup: {
              from: "employeeAffiliations",
              localField: "hrEmail",
              foreignField: "hrEmail",
              as: "teamMembers",
            },
          },

          { $unwind: "$teamMembers" },

          {
            $match: {
              "teamMembers.status": "active",
            },
          },

          {
            $lookup: {
              from: "user",
              localField: "teamMembers.employeeEmail",
              foreignField: "email",
              as: "userInfo",
            },
          },

          {
            $unwind: {
              path: "$userInfo",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $group: {
              _id: {
                companyName: "$teamMembers.companyName",
                employeeEmail: "$teamMembers.employeeEmail",
              },
              employeeName: { $first: "$teamMembers.employeeName" },
              photoURL: { $first: "$userInfo.photoURL" },
              dateOfBirth: { $first: "$userInfo.dateOfBirth" },
              role: { $first: "$userInfo.role" },
            },
          },

          {
            $group: {
              _id: "$_id.companyName",
              members: {
                $push: {
                  employeeEmail: "$_id.employeeEmail",
                  employeeName: "$employeeName",
                  photoURL: "$photoURL",
                  dateOfBirth: "$dateOfBirth",
                  role: "$role",
                },
              },
            },
          },

          {
            $project: {
              _id: 0,
              companyName: "$_id",
              members: 1,
            },
          },
        ])
        .toArray();

      res.send(result);

      res.send(result);
    });

    app;
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
  console.log("server is running port:3000");
});
