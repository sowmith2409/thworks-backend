const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "tasks.db");
let db = null;

// Initialize DB and Server
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'Medium',
        due_date TEXT
      );
    `);

    console.log("Tasks table ready");

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`)
    );
  } catch (e) {
    console.error(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// Health Check
app.get("/", (req, res) => {
  res.send("Task Manager Backend is Running");
});

// Get All Tasks
app.get("/tasks", async (req, res) => {
  try {
    const { status, priority } = req.query;
    let query = "SELECT * FROM tasks WHERE 1=1";

    if (status) query += ` AND status = '${status}'`;
    if (priority) query += ` AND priority = '${priority}'`;

    const tasks = await db.all(query);
    res.status(200).json(tasks);
  } catch (e) {
    console.error("Error fetching tasks:", e.message);
    res.status(500).json({ error: "Error fetching tasks" });
  }
});

// Add New Task
app.post("/tasks", async (req, res) => {
  try {
    const { title, description, status, priority, due_date } = req.body;

    if (!title || !description || !due_date) {
      return res
        .status(400)
        .json({ error: "Title, description, and due_date are required" });
    }

    const query = `
      INSERT INTO tasks (title, description, status, priority, due_date)
      VALUES (?, ?, ?, ?, ?);
    `;
    const result = await db.run(query, [
      title.trim(),
      description.trim(),
      status || "Todo",
      priority || "Medium",
      due_date,
    ]);

    // ✅ Return JSON response
    return res.status(201).json({
      message: "Task added successfully",
      task: {
        id: result.lastID,
        title,
        description,
        status,
        priority,
        due_date,
      },
    });
  } catch (error) {
    console.error("Error adding task:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// Update Task
app.patch("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, due_date } = req.body;

    const updateQuery = `
      UPDATE tasks
      SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        due_date = COALESCE(?, due_date)
      WHERE id = ?;
    `;

    const result = await db.run(updateQuery, [
      title,
      description,
      status,
      priority,
      due_date,
      id,
    ]);

    if (result.changes === 0)
      return res.status(404).json({ error: "Task not found" });

    res.status(200).json({ message: "Task updated successfully" });
  } catch (e) {
    console.error("Error updating task:", e.message);
    res.status(500).json({ error: "Error updating task" });
  }
});

// Delete Task
app.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleteQuery = `DELETE FROM tasks WHERE id = ?;`;

    const result = await db.run(deleteQuery, [id]);

    if (result.changes === 0)
      return res.status(404).json({ error: "Task not found" });

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (e) {
    console.error("Error deleting task:", e.message);
    res.status(500).json({ error: "Error deleting task" });
  }
});

// Smart Insights
app.get("/insights", async (req, res) => {
  try {
    const statusSummary = await db.all(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status;`
    );

    const prioritySummary = await db.all(
      `SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority;`
    );

    const dueSoonTasks = await db.all(`
      SELECT * FROM tasks 
      WHERE due_date <= date('now', '+3 days')
      AND status != 'completed';
    `);

    const totalTasks = await db.get(`SELECT COUNT(*) as total FROM tasks;`);

    const topPriority =
      prioritySummary.length > 0
        ? prioritySummary.sort((a, b) => b.count - a.count)[0].priority
        : "None";

    const summaryText = `You have ${totalTasks.total} total tasks. Most are ${topPriority} priority. ${dueSoonTasks.length} tasks are due within 3 days.`;

    res.status(200).json({
      totalTasks: totalTasks.total,
      statusSummary,
      prioritySummary,
      dueSoonCount: dueSoonTasks.length,
      summaryText,
    });
  } catch (e) {
    console.error("Error generating insights:", e.message);
    res.status(500).json({ error: "Error generating insights" });
  }
});
