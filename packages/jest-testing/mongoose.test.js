/* eslint-env jest */

import mongoose from "mongoose";
import { User, List, Task } from "../express-backend/users/userModel.js";
import { generateAccessToken } from "express-backend/users/userRoutes.js";
import userRoutes from "../express-backend/users/userRoutes.js";
import express from "express";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { jest } from "@jest/globals";

process.env.TOKEN_SECRET = "test_secret";

describe("User Routes", () => {
  let app;
  let testUser;
  let testToken;
  let testList;
  let testTask;

  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/testDB", {});
    app = express();
    app.use(express.json());
    app.use("/api", userRoutes);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await List.deleteMany({});
    await Task.deleteMany({});

    // create a test user
    const hashedPassword = await bcrypt.hash("testpassword", 10);
    testUser = await User.create({
      userName: "testuser",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      password: hashedPassword,
      lists: [],
    });

    // Generate token
    testToken = jwt.sign(
      { userName: testUser.userName },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" },
    );

    // create a test list
    testList = await List.create({
      listID: "test-list-1",
      listName: "Test List",
      tasks: [],
      createdBy: testUser._id,
    });

    // update user list
    await User.findByIdAndUpdate(testUser._id, {
      $push: { lists: testList._id },
    });

    // create a test task
    testTask = await Task.create({
      taskName: "Test Task",
      taskID: "test-task-1",
      list: testList._id,
      completed: false,
    });

    //add task to list
    await List.findByIdAndUpdate(testList._id, {
      $push: { tasks: testTask._id },
    });
  });

  //authentication Tests
  describe("Authentication", () => {
    //login route
    describe("POST /api/login", () => {
      it("should login successfully with correct credentials", async () => {
        const response = await request(app).post("/api/login").send({
          userName: "testuser",
          password: "testpassword",
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("token");
        expect(response.body.userName).toBe("testuser");
      });

      it("should fail login with incorrect username", async () => {
        const response = await request(app).post("/api/login").send({
          userName: "wronguser",
          password: "testpassword",
        });

        expect(response.statusCode).toBe(401);
      });

      it("should fail login with no username or password", async () => {
        const response = await request(app).post("/api/login").send({
          userName: "",
          password: "",
        });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe(
          "Username and password are required",
        );
      });

      it("should fail login with incorrect password", async () => {
        const response = await request(app).post("/api/login").send({
          userName: "testuser",
          password: "wrongpassword",
        });

        expect(response.statusCode).toBe(401);
      });

      it("should fail login with missing credentials", async () => {
        const response = await request(app).post("/api/login").send({});

        expect(response.statusCode).toBe(400);
      });
    });

    //Account register test
    describe("POST /api/register", () => {
      it("should create a new user successfully", async () => {
        const response = await request(app).post("/api/register").send({
          userName: "newuser",
          email: "new@example.com",
          firstName: "New",
          lastName: "User",
          password: "newpassword",
        });

        expect(response.statusCode).toBe(201);
        expect(response.body).toHaveProperty("user");
        expect(response.body).toHaveProperty("token");
        expect(response.body.user.userName).toBe("newuser");
      });

      it("should fail registration with existing email", async () => {
        const response = await request(app).post("/api/register").send({
          userName: "anotheruser",
          email: "test@example.com",
          firstName: "Another",
          lastName: "User",
          password: "anotherpassword",
        });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe("Email already exists");
      });

      it("should fail registration with missing fields", async () => {
        const response = await request(app).post("/api/register").send({
          userName: "incompleteuser",
        });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe("All fields are required.");
      });
    });
  });

  //user routes
  describe("User Routes", () => {
    //get users
    describe("GET /api/users", () => {
      it("should retrieve all users", async () => {
        const response = await request(app).get("/api/users");

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    //get userName
    describe("GET /api/users/:userName", () => {
      it("should retrieve a specific user", async () => {
        const response = await request(app)
          .get(`/api/users/${testUser.userName}`)
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.userName).toBe(testUser.userName);
      });

      it("should fail to retrieve user without authentication", async () => {
        const response = await request(app).get(
          `/api/users/${testUser.userName}`,
        );

        expect(response.statusCode).toBe(401);
      });
    });
  });

  //list routes
  describe("List Routes", () => {
    //get all lists test
    describe("GET /api/users/:userName/lists", () => {
      it("should retrieve user lists", async () => {
        const response = await request(app)
          .get(`/api/users/${testUser.userName}/lists`)
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    //create a list
    describe("POST /api/users/:userName/lists", () => {
      it("should create a new list", async () => {
        const response = await request(app)
          .post(`/api/users/${testUser.userName}/lists`)
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            listID: "new-test-list",
            listName: "New Test List",
            color: 1,
          });

        expect(response.statusCode).toBe(201);
        expect(response.body.listName).toBe("New Test List");
      });
    });

    //update given user list
    describe("PUT /api/users/:userName/lists/:listId", () => {
      it("should update an existing list", async () => {
        const response = await request(app)
          .put(`/api/users/${testUser.userName}/lists/${testList.listID}`)
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            listName: "Updated Test List",
          });

        expect(response.statusCode).toBe(200);
        expect(response.body.listName).toBe("Updated Test List");
      });
    });

    //delete a list test
    describe("DELETE /api/users/:userName/lists/:listId", () => {
      it("should delete an existing list", async () => {
        const response = await request(app)
          .delete(`/api/users/${testUser.userName}/lists/${testList.listID}`)
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe("List and associated tasks deleted");
      });

      it("should fail deleting a non-existing list", async () => {
        const response = await request(app)
          .delete(`/api/users/${testUser.userName}/lists/nonexistent-list`)
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(404);
        expect(response.body.message).toBe("List not found");
      });
    });
  });

  // Task Routes
  describe("Task Routes", () => {
    //get user tasks for specific list
    describe("GET /api/users/:userName/lists/:listId/tasks", () => {
      it("should retrieve list tasks", async () => {
        const response = await request(app)
          .get(`/api/users/${testUser.userName}/lists/${testList.listID}/tasks`)
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it("should fail retrieving list", async () => {
        const response = await request(app)
          .get(`/api/users/${testUser.userName}/lists/nonexistent/tasks`)
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(404);
        expect(response.body.message).toBe("List not found");
      });
    });
    //create new task
    describe("POST /api/users/:userName/lists/:listId/tasks", () => {
      it("should create a new task", async () => {
        const response = await request(app)
          .post(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks`,
          )
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            taskName: "New Test Task",
            notes: "Test notes",
            priority: "Medium",
          });

        expect(response.statusCode).toBe(201);
        expect(response.body.taskName).toBe("New Test Task");
      });

      it("should throw an error when it is unauthorized", async () => {
        const response = await request(app)
          .post(`/api/users/anotheruser/lists/${testList.listID}/tasks`)
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            taskName: "New Test Task",
            notes: "Test notes",
            priority: "Medium",
          });

        expect(response.statusCode).toBe(403);
        expect(response.body.message).toBe(
          "Unauthorized to add tasks to this list",
        );
      });

      it("should fail creating a new task", async () => {
        const response = await request(app)
          .post(`/api/users/${testUser.userName}/lists/fake/tasks`)
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            taskName: "New Test Task",
          });

        expect(response.statusCode).toBe(404);
      });

      it("should fail creating a new task", async () => {
        const response = await request(app)
          .post(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks`,
          )
          .set("Authorization", `Bearer different`)
          .send({
            taskName: "New Test Task",
          });

        expect(response.statusCode).toBe(401);
      });

      it("should create a new task", async () => {
        const response = await request(app)
          .post(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks`,
          )
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            taskName: "New Test Task",
          });

        expect(response.statusCode).toBe(201);
      });
    });

    //update task
    describe("PUT /api/users/:userName/lists/:listId/tasks/:taskId", () => {
      it("should update an existing task", async () => {
        const response = await request(app)
          .put(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks/${testTask.taskID}`,
          )
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            completed: true,
          });

        expect(response.statusCode).toBe(200);
        expect(response.body.completed).toBe(true);
      });

      it("should fail updating a non-existing task", async () => {
        const response = await request(app)
          .put(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks/nonexistent-task`,
          )
          .set("Authorization", `Bearer ${testToken}`)
          .send({
            completed: true,
          });

        expect(response.statusCode).toBe(404);
        expect(response.body.message).toBe("Task not found");
      });
    });

    //delete Task
    describe("DELETE /api/users/:userName/lists/:listId/tasks/:taskId", () => {
      it("should delete an existing task", async () => {
        const response = await request(app)
          .delete(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks/${testTask.taskID}`,
          )
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe("tasks deleted");
      });

      it("should fail deleting an existing task", async () => {
        const response = await request(app)
          .delete(
            `/api/users/${testUser.userName}/lists/${testList.listID}/tasks/nonexistent-task`,
          )
          .set("Authorization", `Bearer ${testToken}`);

        expect(response.statusCode).toBe(404);
        expect(response.body.message).toBe("Task not found");
      });
    });

    describe("generateAccessToken", () => {
      it("should generate a token successfully", async () => {
        const username = "testuser";
        const token = "test-token";

        jest
          .spyOn(jwt, "sign")
          .mockImplementation((payload, secret, options, callback) => {
            callback(null, token); // Simulate successful token generation
          });

        await expect(generateAccessToken(username)).resolves.toBe(token);

        jest.restoreAllMocks();
      });

      it("should handle errors during token generation", async () => {
        const username = "testuser";
        const errorMessage = "Error generating token";

        jest
          .spyOn(jwt, "sign")
          .mockImplementation((payload, secret, options, callback) => {
            callback(new Error(errorMessage), null); // Simulate an error
          });

        await expect(generateAccessToken(username)).rejects.toThrow(
          errorMessage,
        );

        jest.restoreAllMocks();
      });
    });
  });
});
