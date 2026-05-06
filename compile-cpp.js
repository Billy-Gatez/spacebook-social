const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { v4: uuid } = require("uuid");

const router = express.Router();

router.post("/compile-cpp", async (req, res) => {
  try {
    const id = uuid();
    const dir = path.join("/tmp", id);
    fs.mkdirSync(dir);

    // Write all files
    for (const [name, content] of Object.entries(req.body.files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }

    // Collect .cpp files
    const cppFiles = Object.keys(req.body.files)
      .filter(f => f.endsWith(".cpp"))
      .map(f => `"${f}"`)
      .join(" ");

    const exe = path.join(dir, "app.out");

    // Compile
    exec(`g++ ${cppFiles} -o app.out`, { cwd: dir }, (err, stdout, stderr) => {
      if (err) {
        return res.json({ error: stderr });
      }

      // Run
      exec(exe, (runErr, runOut, runErrOut) => {
        if (runErr) {
          return res.json({ error: runErrOut });
        }

        res.json({ output: runOut });
      });
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
