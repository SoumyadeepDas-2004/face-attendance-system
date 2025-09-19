require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
};

// ---------------- Utility functions ----------------
function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function cosineDistance(a, b) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return 1 - (dot / (Math.sqrt(normA) * Math.sqrt(normB)));
}

// ---------------- Register student ----------------
app.post('/register', async (req, res) => {
  try {
    const { name, student_id, className, embedding } = req.body;
    if (!student_id || !embedding)
      return res.status(400).json({ error: 'Missing fields' });

    const conn = await mysql.createConnection(dbConfig);
    await conn.execute(
      'INSERT INTO students (student_id, name, class, face_embedding) VALUES (?, ?, ?, ?)',
      [student_id, name || '', className || '', JSON.stringify(embedding)]
    );
    await conn.end();

    return res.json({ message: 'Registered' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ---------------- Recognize student ----------------
app.post('/recognize', async (req, res) => {
  try {
    const { embedding } = req.body;
    if (!embedding)
      return res.status(400).json({ error: 'Missing embedding' });

    const conn = await mysql.createConnection(dbConfig);
    // const [rows] = await conn.execute(
    //   'SELECT student_id, name, face_embedding FROM students'
    // );
     const [rows] = await conn.execute(
  'SELECT student_id, name, class, face_embedding FROM students'
);

    await conn.end();

    let best = null;
    let bestScore = Infinity;

    for (const r of rows) {
      // const stored = JSON.parse(r.face_embedding);
      // const dist = cosineDistance(stored, embedding); // or euclideanDistance
      const stored = typeof r.face_embedding === 'string' ? JSON.parse(r.face_embedding) : r.face_embedding;
      const dist = cosineDistance(stored, embedding);

      if (dist < bestScore) {
        bestScore = dist;
        best = r;
      }
    }

    if (best && bestScore < 0.35) {
      return res.json({ success: true, student: best, score: bestScore });
    } else {
      return res.json({ success: false, message: 'No match', score: bestScore });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ---------------- Mark attendance ----------------
app.post('/attendance', async (req, res) => {
  try {
    const { embedding } = req.body;
    if (!embedding)
      return res.status(400).json({
        status: "error",
        studentId: null,
        name: null,
        className: null,
        message: 'Missing embedding'
      });

    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      'SELECT student_id, name, class, face_embedding FROM students'
    );
    await conn.end();

    let best = null;
    let bestDist = Infinity;
    for (const r of rows) {
      const stored = typeof r.face_embedding === 'string' ? JSON.parse(r.face_embedding) : r.face_embedding;
      const dist = euclideanDistance(stored, embedding);

      if (dist < bestDist) {
        bestDist = dist;
        best = r;
      }
    }

    const THRESHOLD = 0.7;
    if (best && bestDist <= THRESHOLD) {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8);

      const conn2 = await mysql.createConnection(dbConfig);
      await conn2.execute(
        'INSERT INTO attendance (student_id, date, time) VALUES (?, ?, ?)',
        [best.student_id, date, time]
      );
      await conn2.end();

      // ✅ Return a consistent response
      return res.json({
        status: "success",
        studentId: best.student_id,
        name: best.name,
        className: best.class || null,
        message: 'Attendance marked',
        dist: bestDist
      });
    } else {
      // ✅ Also return the same structure even for no match
      return res.status(200).json({
        status: "error",
        studentId: null,
        name: null,
        className: null,
        message: "No match",
        dist: bestDist
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      studentId: null,
      name: null,
      className: null,
      message: 'Server error',
      detail: err.message
    });
  }
});

// app.post('/attendance', async (req, res) => {
//   try {
//     const { embedding } = req.body;
//     if (!embedding)
//       return res.status(400).json({ error: 'Missing embedding' });

//     const conn = await mysql.createConnection(dbConfig);
//     const [rows] = await conn.execute(
//       'SELECT student_id, name, face_embedding FROM students'
//     );
//     await conn.end();

//     let best = null;
//     let bestDist = Infinity;
//     for (const r of rows) {
//       // const stored = JSON.parse(r.face_embedding);
//       // const dist = euclideanDistance(stored, embedding); // can also use cosine
//       const stored = typeof r.face_embedding === 'string' ? JSON.parse(r.face_embedding) : r.face_embedding;
//       const dist = euclideanDistance(stored, embedding);

//       if (dist < bestDist) {
//         bestDist = dist;
//         best = r;
//       }
//     }

//     const THRESHOLD = 0.7;
//     if (best && bestDist <= THRESHOLD) {
//       const now = new Date();
//       const date = now.toISOString().slice(0, 10);
//       const time = now.toTimeString().slice(0, 8);

//       const conn2 = await mysql.createConnection(dbConfig);
//       await conn2.execute(
//         'INSERT INTO attendance (student_id, date, time) VALUES (?, ?, ?)',
//         [best.student_id, date, time]
//       );
//       await conn2.end();

//       return res.json({
//         message: 'Attendance marked',
//         student_id: best.student_id,
//         name: best.name,
//         dist: bestDist
//       });
//     } else {
//       return res.status(404).json({ message: 'No match', bestDist });
//     }
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ error: 'Server error', detail: err.message });
//   }
// });

// ---------------- Start server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log('Server running on port', PORT));

