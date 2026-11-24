const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const { serialize, deserialize } = require("bson");

const { connectDb, dbName, mongoUri } = require("./db");
const { executeOperation } = require("./queryExecutor");
const { quizData } = require("./quizData");
const { w3resourceExercises } = require("./w3resourceExercises");
const { normalizeQueryText, toPlain } = require("./utils");

const allQuizData = [...quizData, ...w3resourceExercises];

function extractCollectionsFromOperationSpec(spec) {
  const found = new Set();

  if (!spec || typeof spec !== "object") {
    return found;
  }

  if (typeof spec.collection === "string" && spec.collection.trim()) {
    found.add(spec.collection.trim());
  }

  function visit(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (typeof node !== "object") return;

    for (const [key, value] of Object.entries(node)) {
      if (key === "$lookup" && value && typeof value === "object" && typeof value.from === "string") {
        found.add(value.from);
      }
      visit(value);
    }
  }

  visit(spec.pipeline);
  return found;
}

function getQuestionCollections(question) {
  if (Array.isArray(question?.collections) && question.collections.length > 0) {
    return [...new Set(question.collections)];
  }

  const inferred = extractCollectionsFromOperationSpec(question?.operationSpec);
  return inferred.size > 0 ? [...inferred] : ["non specifiee"];
}

function getQuestionPathMeta(question) {
  const id = Number(question?.id || 0);

  if (id >= 1 && id <= 5) {
    return {
      pathId: "p-fondamentaux-find",
      pathTitle: "Fondamentaux Find",
      pathTheme: "filtrage",
      pathStep: id,
      pathOrder: 1,
    };
  }

  if (id >= 6 && id <= 12) {
    return {
      pathId: "p-aggregation-base",
      pathTitle: "Aggregation Base",
      pathTheme: "aggregation",
      pathStep: id - 5,
      pathOrder: 2,
    };
  }

  if (id >= 13 && id <= 20) {
    return {
      pathId: "p-joins-metrics",
      pathTitle: "Joins et Metriques",
      pathTheme: "lookup",
      pathStep: id - 12,
      pathOrder: 3,
    };
  }

  if (id >= 21 && id <= 30) {
    return {
      pathId: "p-analytics-expert",
      pathTitle: "Analytics Expert",
      pathTheme: "expert",
      pathStep: id - 20,
      pathOrder: 4,
    };
  }

  if (id >= 1001 && id <= 1018) {
    return {
      pathId: "p-restaurants-filtres",
      pathTitle: "Restaurants Filtres",
      pathTheme: "restaurants",
      pathStep: id - 1000,
      pathOrder: 5,
    };
  }

  if (id >= 1019 && id <= 1040) {
    return {
      pathId: "p-restaurants-conditions",
      pathTitle: "Restaurants Conditions",
      pathTheme: "restaurants",
      pathStep: id - 1018,
      pathOrder: 6,
    };
  }

  if (id >= 1041 && id <= 1060) {
    return {
      pathId: "p-restaurants-aggregation",
      pathTitle: "Restaurants Aggregation",
      pathTheme: "restaurants",
      pathStep: id - 1040,
      pathOrder: 7,
    };
  }

  if (id >= 1061 && id <= 1080) {
    return {
      pathId: "p-restaurants-statistiques",
      pathTitle: "Restaurants Statistiques",
      pathTheme: "restaurants",
      pathStep: id - 1060,
      pathOrder: 8,
    };
  }

  if (id >= 1081) {
    return {
      pathId: "p-restaurants-mastery",
      pathTitle: "Restaurants Mastery",
      pathTheme: "restaurants",
      pathStep: id - 1080,
      pathOrder: 9,
    };
  }

  return {
    pathId: "p-divers",
    pathTitle: "Divers",
    pathTheme: "mixte",
    pathStep: 1,
    pathOrder: 99,
  };
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const ROOT_DIR = path.resolve(__dirname, "..");
const SCHEMA_DIR = path.join(ROOT_DIR, "schemas");
const DEMO_DIR = path.join(ROOT_DIR, "data", "demo");
const BACKUP_DIR = path.join(ROOT_DIR, "backups");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

async function loadJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function getSchemaFiles() {
  const entries = await fs.readdir(SCHEMA_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name);
}

function sanitizeCollectionName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/\$/g, "_")
    .replace(/\u0000/g, "");
}

function deriveCollectionFromFile(file) {
  const fileName = file?.originalname || "";
  const baseName = path.parse(fileName).name;
  return sanitizeCollectionName(baseName);
}

async function resetDemoData(db) {
  const entries = await fs.readdir(DEMO_DIR, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  for (const file of jsonFiles) {
    const collectionName = file.name.replace(/\.json$/i, "");
    const docs = await loadJsonFile(path.join(DEMO_DIR, file.name));
    const col = db.collection(collectionName);
    await col.deleteMany({});
    if (Array.isArray(docs) && docs.length > 0) {
      await col.insertMany(docs);
    }
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    const db = await connectDb();
    await db.command({ ping: 1 });

    res.json({
      ok: true,
      dbName,
      mongoUri,
      quizCount: allQuizData.length,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/quiz/questions", (_req, res) => {
  const payload = allQuizData.map((q) => ({
    id: q.id,
    type: q.type || "query",
    level: q.level,
    title: q.title,
    prompt: q.prompt,
    hint: q.hint,
    source: q.source || "mongolingo",
    collections: getQuestionCollections(q),
    ...getQuestionPathMeta(q),
  }));
  res.json({ ok: true, questions: payload });
});

app.get("/api/quiz/:id", (req, res) => {
  const id = Number(req.params.id);
  const quiz = allQuizData.find((q) => q.id === id);
  if (!quiz) {
    return res.status(404).json({ ok: false, error: "Question introuvable" });
  }

  return res.json({
    ok: true,
    question: {
      ...quiz,
      collections: getQuestionCollections(quiz),
      ...getQuestionPathMeta(quiz),
    },
  });
});

app.post("/api/quiz/:id/check", (req, res) => {
  const id = Number(req.params.id);
  const quiz = allQuizData.find((q) => q.id === id);
  if (!quiz) {
    return res.status(404).json({ ok: false, error: "Question introuvable" });
  }

  if (quiz.type === "mcq") {
    const userChoice = String(req.body?.answer || "").trim().toUpperCase();
    const correctChoice = String(quiz.correctOption || "").trim().toUpperCase();
    const correctOption = Array.isArray(quiz.options)
      ? quiz.options.find((opt) => String(opt.key).toUpperCase() === correctChoice)
      : null;
    const expected = correctOption
      ? `${correctChoice}. ${correctOption.text}`
      : correctChoice;

    return res.json({
      ok: true,
      isCorrect: Boolean(userChoice) && userChoice === correctChoice,
      expected,
      explanation: quiz.explanation,
    });
  }

  const userAnswer = normalizeQueryText(req.body?.answer || "");
  const expected = normalizeQueryText(quiz.solutionMql);

  const isCorrect = userAnswer.length > 0 && userAnswer === expected;

  return res.json({
    ok: true,
    isCorrect,
    expected: quiz.solutionMql,
    explanation: quiz.explanation,
  });
});

app.post("/api/quiz/:id/run", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const quiz = allQuizData.find((q) => q.id === id);
    if (!quiz) {
      return res.status(404).json({ ok: false, error: "Question introuvable" });
    }

    if (quiz.runnableInMongolingo === false || !quiz.operationSpec) {
      return res.status(400).json({
        ok: false,
        error: "Cette question locale n est pas executable automatiquement dans la base demo actuelle.",
      });
    }

    const db = await connectDb();
    const result = await executeOperation(db, quiz.operationSpec);

    return res.json({
      ok: true,
      query: quiz.solutionMql,
      explanation: quiz.explanation,
      result: toPlain(result),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/query/run", async (req, res) => {
  try {
    const db = await connectDb();
    const result = await executeOperation(db, req.body?.operationSpec);
    res.json({ ok: true, result: toPlain(result) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/meta/collections", async (_req, res) => {
  try {
    const db = await connectDb();
    const schemaFiles = await getSchemaFiles();
    const schemaByCollection = new Map();

    for (const fileName of schemaFiles) {
      const collectionName = fileName.replace(/\.schema\.json$/i, "");
      const schema = await loadJsonFile(path.join(SCHEMA_DIR, fileName));
      schemaByCollection.set(collectionName, schema);
    }

    const dbCollections = await db.listCollections().toArray();
    const collectionNames = new Set(schemaByCollection.keys());
    for (const info of dbCollections) {
      collectionNames.add(info.name);
    }

    const collections = [];
    for (const collectionName of [...collectionNames].sort()) {
      const schema = schemaByCollection.get(collectionName) || null;
      const count = await db.collection(collectionName).countDocuments();
      collections.push({ collectionName, schema, count });
    }

    res.json({ ok: true, collections });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/data/reset-demo", async (_req, res) => {
  try {
    const db = await connectDb();
    await resetDemoData(db);
    res.json({ ok: true, message: "Donnees demo rechargees." });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/data/import/json", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Fichier manquant." });
    }

    let collection = sanitizeCollectionName(req.body?.collection || "");
    const useFileCollection = String(req.body?.useFileCollection || "").toLowerCase() === "true";
    const db = await connectDb();
    const payload = JSON.parse(req.file.buffer.toString("utf8"));
    let docs = null;

    if (Array.isArray(payload)) {
      docs = payload;
    } else if (payload && typeof payload === "object" && Array.isArray(payload.documents)) {
      docs = payload.documents;
      if (!collection && typeof payload.collection === "string") {
        collection = sanitizeCollectionName(payload.collection);
      }
    }

    if (!Array.isArray(docs)) {
      return res.status(400).json({
        ok: false,
        error: "Le JSON doit etre un tableau de documents ou un objet { collection, documents }.",
      });
    }

    if (!collection && useFileCollection) {
      collection = deriveCollectionFromFile(req.file);
    }

    if (!collection) {
      return res.status(400).json({ ok: false, error: "Collection manquante." });
    }

    if (docs.length > 0) {
      await db.collection(collection).insertMany(docs);
    }

    return res.json({ ok: true, collection, inserted: docs.length });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/data/import/bson", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Fichier manquant." });
    }

    let collection = sanitizeCollectionName(req.body?.collection || "");
    const useFileCollection = String(req.body?.useFileCollection || "").toLowerCase() === "true";
    const payload = deserialize(req.file.buffer);
    let docs = null;

    if (Array.isArray(payload)) {
      docs = payload;
    } else if (payload && typeof payload === "object" && Array.isArray(payload.documents)) {
      docs = payload.documents;
      if (!collection && typeof payload.collection === "string") {
        collection = sanitizeCollectionName(payload.collection);
      }
    }

    if (!Array.isArray(docs)) {
      return res.status(400).json({
        ok: false,
        error: "Format BSON invalide. Attendu: tableau de documents ou { collection, documents }.",
      });
    }

    if (!collection && useFileCollection) {
      collection = deriveCollectionFromFile(req.file);
    }

    if (!collection) {
      return res.status(400).json({ ok: false, error: "Collection manquante." });
    }

    const db = await connectDb();
    if (docs.length > 0) {
      await db.collection(collection).insertMany(docs);
    }

    return res.json({ ok: true, collection, inserted: docs.length });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/data/export/json/:collection", async (req, res) => {
  try {
    const collection = req.params.collection;
    const db = await connectDb();
    const docs = await db.collection(collection).find({}).toArray();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=${collection}.json`);
    res.send(JSON.stringify(toPlain(docs), null, 2));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/data/export/bson/:collection", async (req, res) => {
  try {
    const collection = req.params.collection;
    const db = await connectDb();
    const docs = await db.collection(collection).find({}).toArray();

    const payload = serialize({ documents: docs });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=${collection}.bson`);
    res.send(payload);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/data/backup", async (_req, res) => {
  try {
    const db = await connectDb();
    const collections = await db.listCollections().toArray();

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const targetDir = path.join(BACKUP_DIR, stamp);
    await fs.mkdir(targetDir, { recursive: true });

    for (const colInfo of collections) {
      const name = colInfo.name;
      const docs = await db.collection(name).find({}).toArray();

      await fs.writeFile(path.join(targetDir, `${name}.json`), JSON.stringify(toPlain(docs), null, 2), "utf8");
      await fs.writeFile(path.join(targetDir, `${name}.bson`), serialize({ documents: docs }));
    }

    return res.json({ ok: true, backupFolder: stamp, collections: collections.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/data/backups", async (_req, res) => {
  try {
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
    const backups = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
    res.json({ ok: true, backups });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Mongolingo API ready on http://localhost:${port}`);
});
