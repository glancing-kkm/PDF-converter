const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
const PORT = process.env.PORT || 3000;

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp"]);

function extFromName(fileName) {
  const lower = fileName.toLowerCase();
  const parts = lower.split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function baseName(fileName) {
  const ext = path.extname(fileName);
  return path.basename(fileName, ext);
}

async function convertWithLibreOffice(inputPath, outputDir) {
  await execFileAsync(
    "soffice",
    [
      "--headless",
      "--nologo",
      "--nolockcheck",
      "--nodefault",
      "--norestore",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath,
    ],
    { timeout: 120000 },
  );
}

app.post("/api/convert-office", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "파일이 없습니다." });
    return;
  }

  const extension = extFromName(req.file.originalname || "");
  if (!OFFICE_EXTENSIONS.has(extension)) {
    res.status(400).json({ error: "doc/docx/xls/xlsx/ppt/pptx/hwp 파일만 변환할 수 있습니다." });
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-converter-"));
  const safeInputName = path.basename(req.file.originalname || `input.${extension}`);
  const inputPath = path.join(tempDir, safeInputName);
  const outputName = `${baseName(safeInputName)}.pdf`;
  const outputPath = path.join(tempDir, outputName);

  try {
    await fs.writeFile(inputPath, req.file.buffer);
    await convertWithLibreOffice(inputPath, tempDir);

    const pdfBuffer = await fs.readFile(outputPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    if (String(error.message || "").includes("soffice")) {
      res.status(500).json({ error: "서버에 LibreOffice(soffice)가 설치되지 않았습니다." });
    } else {
      res.status(500).json({ error: "파일 변환 중 오류가 발생했습니다." });
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`PDF converter server started on http://localhost:${PORT}`);
});
