const fileInput = document.getElementById("fileInput");
const convertBtn = document.getElementById("convertBtn");
const mergeBtn = document.getElementById("mergeBtn");
const clearBtn = document.getElementById("clearBtn");
const fileList = document.getElementById("fileList");
const statusText = document.getElementById("statusText");

const filesState = [];

function updateStatus(message) {
  statusText.textContent = message;
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(name) {
  const parts = name.split(".");
  if (parts.length === 1) return name;
  parts.pop();
  return parts.join(".");
}

function setBusyState(isBusy) {
  convertBtn.disabled = isBusy;
  mergeBtn.disabled = isBusy;
  clearBtn.disabled = isBusy;
  fileInput.disabled = isBusy;
}

function isTextLike(file) {
  const textTypes = [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "text/json",
  ];
  if (textTypes.includes(file.type)) return true;

  const lower = file.name.toLowerCase();
  return [".txt", ".md", ".csv", ".json", ".log"].some((ext) =>
    lower.endsWith(ext),
  );
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로딩에 실패했습니다."));
    img.src = src;
  });
}

function renderList() {
  fileList.innerHTML = "";

  if (filesState.length === 0) {
    const empty = document.createElement("li");
    empty.className = "file-item";
    empty.textContent = "업로드된 파일이 없습니다.";
    fileList.appendChild(empty);
    return;
  }

  filesState.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "file-item";

    const top = document.createElement("div");
    top.className = "file-item-top";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = `${index + 1}. ${entry.file.name}`;

    const controls = document.createElement("div");
    controls.className = "file-controls";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", () => {
      filesState.splice(index, 1);
      renderList();
      updateStatus("파일 목록이 갱신되었습니다.");
    });

    controls.appendChild(removeBtn);
    top.appendChild(name);
    top.appendChild(controls);

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${entry.file.type || "unknown"} | ${formatSize(entry.file.size)}`;

    const state = document.createElement("div");
    state.className = "file-meta";
    state.textContent = `상태: ${entry.status}`;

    const link = document.createElement("a");
    link.className = `download-link ${entry.downloadUrl ? "" : "hidden"}`;
    link.href = entry.downloadUrl || "#";
    link.download = `${baseName(entry.file.name)}.pdf`;
    link.textContent = "개별 PDF 다운로드";

    li.appendChild(top);
    li.appendChild(meta);
    li.appendChild(state);
    li.appendChild(link);
    fileList.appendChild(li);
  });
}

async function imageFileToPdfBytes(file) {
  const { jsPDF } = window.jspdf;
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const orientation = img.width >= img.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
  const drawWidth = img.width * ratio;
  const drawHeight = img.height * ratio;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;

  const typeMatch = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
  const format = (typeMatch ? typeMatch[1] : "JPEG").toUpperCase();

  pdf.addImage(dataUrl, format, x, y, drawWidth, drawHeight);
  return pdf.output("arraybuffer");
}

async function textFileToPdfBytes(file) {
  const { jsPDF } = window.jspdf;
  const text = await file.text();
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const lineHeight = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lines = pdf.splitTextToSize(text || " ", pageWidth - margin * 2);

  let y = margin;
  lines.forEach((line, idx) => {
    if (idx > 0 && y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  });

  return pdf.output("arraybuffer");
}

async function convertFileToPdfBytes(file) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return file.arrayBuffer();
  }
  if (file.type.startsWith("image/")) {
    return imageFileToPdfBytes(file);
  }
  if (isTextLike(file)) {
    return textFileToPdfBytes(file);
  }
  throw new Error("지원하지 않는 파일 형식입니다. 이미지, 텍스트, PDF 파일을 사용하세요.");
}

function downloadBytes(filename, bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function resetDownloadUrls() {
  filesState.forEach((entry) => {
    if (entry.downloadUrl) URL.revokeObjectURL(entry.downloadUrl);
    entry.downloadUrl = null;
  });
}

async function convertAllToIndividualPdf() {
  if (filesState.length === 0) {
    updateStatus("변환할 파일이 없습니다.");
    return;
  }

  setBusyState(true);
  updateStatus("개별 PDF 변환 중...");
  resetDownloadUrls();

  let successCount = 0;
  for (let i = 0; i < filesState.length; i += 1) {
    const entry = filesState[i];
    entry.status = "변환 중";
    renderList();

    try {
      const bytes = await convertFileToPdfBytes(entry.file);
      entry.pdfBytes = bytes;
      const blob = new Blob([bytes], { type: "application/pdf" });
      entry.downloadUrl = URL.createObjectURL(blob);
      entry.status = "변환 완료";
      successCount += 1;
    } catch (error) {
      entry.status = `실패 - ${error.message}`;
    }
    renderList();
  }

  setBusyState(false);
  updateStatus(`개별 PDF 변환 완료: ${successCount}/${filesState.length}`);
}

async function mergeByUploadOrder() {
  if (filesState.length === 0) {
    updateStatus("병합할 파일이 없습니다.");
    return;
  }

  setBusyState(true);
  updateStatus("업로드 순서대로 PDF 병합 중...");

  try {
    const mergedPdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < filesState.length; i += 1) {
      const entry = filesState[i];
      entry.status = "병합 준비 중";
      renderList();

      if (!entry.pdfBytes) {
        entry.pdfBytes = await convertFileToPdfBytes(entry.file);
      }
      const doc = await PDFLib.PDFDocument.load(entry.pdfBytes);
      const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
      entry.status = "병합 반영 완료";
      renderList();
    }

    const mergedBytes = await mergedPdf.save();
    downloadBytes(`merged-${Date.now()}.pdf`, mergedBytes);
    updateStatus("병합 PDF 생성 완료. 다운로드가 시작되었습니다.");
  } catch (error) {
    updateStatus(`병합 실패: ${error.message}`);
  } finally {
    setBusyState(false);
  }
}

fileInput.addEventListener("change", (event) => {
  const selectedFiles = Array.from(event.target.files || []);
  if (selectedFiles.length === 0) return;

  selectedFiles.forEach((file) => {
    filesState.push({
      file,
      status: "대기 중",
      pdfBytes: null,
      downloadUrl: null,
    });
  });

  fileInput.value = "";
  renderList();
  updateStatus(`${selectedFiles.length}개 파일이 추가되었습니다. 현재 총 ${filesState.length}개`);
});

convertBtn.addEventListener("click", convertAllToIndividualPdf);
mergeBtn.addEventListener("click", mergeByUploadOrder);
clearBtn.addEventListener("click", () => {
  resetDownloadUrls();
  filesState.length = 0;
  renderList();
  updateStatus("목록을 비웠습니다.");
});

renderList();
