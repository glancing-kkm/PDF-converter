const convertInput = document.getElementById("convertInput");
const mergeInput = document.getElementById("mergeInput");
const convertDrop = document.getElementById("convertDrop");
const mergeDrop = document.getElementById("mergeDrop");
const pickConvertBtn = document.getElementById("pickConvertBtn");
const pickMergeBtn = document.getElementById("pickMergeBtn");
const convertAllBtn = document.getElementById("convertAllBtn");
const mergeBtn = document.getElementById("mergeBtn");
const moveToMergeBtn = document.getElementById("moveToMergeBtn");
const clearConvertBtn = document.getElementById("clearConvertBtn");
const clearMergeBtn = document.getElementById("clearMergeBtn");
const convertList = document.getElementById("convertList");
const mergeGrid = document.getElementById("mergeGrid");
const statusText = document.getElementById("statusText");

const convertItems = [];
const mergeItems = [];
const OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp"];

let dragSourceId = null;

function updateStatus(message) {
  statusText.textContent = message;
}

function setBusyState(isBusy) {
  [
    convertInput,
    mergeInput,
    pickConvertBtn,
    pickMergeBtn,
    convertAllBtn,
    mergeBtn,
    moveToMergeBtn,
    clearConvertBtn,
    clearMergeBtn,
  ].forEach((el) => {
    el.disabled = isBusy;
  });
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
  return [".txt", ".md", ".csv", ".json", ".log"].some((ext) => lower.endsWith(ext));
}

function getFileKind(file) {
  const lower = file.name.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() : "";
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (isTextLike(file)) return "text";
  if (OFFICE_EXTENSIONS.includes(ext)) return "office";
  return "unsupported";
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
  const kind = getFileKind(file);
  if (kind === "pdf") return file.arrayBuffer();
  if (kind === "image") return imageFileToPdfBytes(file);
  if (kind === "text") return textFileToPdfBytes(file);
  if (kind === "office") return convertOfficeFileToPdfBytes(file);
  throw new Error("지원하지 않는 파일 형식");
}

async function convertOfficeFileToPdfBytes(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch("/api/convert-office", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "오피스/HWP 파일 변환에 실패했습니다.";
    try {
      const json = await response.json();
      if (json?.error) message = json.error;
    } catch (error) {
      // ignore parse error
    }
    throw new Error(message);
  }
  return response.arrayBuffer();
}

function makePdfBlobUrl(bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

function renderConvertList() {
  convertList.innerHTML = "";

  if (convertItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "file-item convert-empty";
    empty.textContent = "변환 된 파일이 없습니다";
    convertList.appendChild(empty);
    return;
  }

  convertItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "file-item";

    const top = document.createElement("div");
    top.className = "file-item-top";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = `${index + 1}. ${item.file.name}`;

    const controls = document.createElement("div");
    controls.className = "file-controls";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", () => {
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      convertItems.splice(index, 1);
      renderConvertList();
      updateStatus("변환 목록을 갱신했습니다.");
    });

    controls.appendChild(removeBtn);
    top.appendChild(name);
    top.appendChild(controls);

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${item.file.type || "unknown"} | ${formatSize(item.file.size)}`;

    const state = document.createElement("div");
    state.className = "file-meta";
    state.textContent = `상태: ${item.status}`;

    const link = document.createElement("a");
    link.className = `download-link ${item.downloadUrl ? "" : "hidden"}`;
    link.href = item.downloadUrl || "#";
    link.download = `${baseName(item.file.name)}.pdf`;
    link.textContent = "PDF 다운로드";

    li.appendChild(top);
    li.appendChild(meta);
    li.appendChild(state);
    li.appendChild(link);
    convertList.appendChild(li);
  });
}

function renderMergeGrid() {
  mergeGrid.innerHTML = "";

  if (mergeItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "file-item merge-empty";
    empty.textContent = "병합 된 PDF가 없습니다";
    mergeGrid.appendChild(empty);
    return;
  }

  mergeItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "merge-item";
    card.draggable = true;
    card.dataset.id = item.id;

    card.addEventListener("dragstart", () => {
      dragSourceId = item.id;
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      dragSourceId = null;
      card.classList.remove("dragging");
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!dragSourceId || dragSourceId === item.id) return;
      const fromIndex = mergeItems.findIndex((x) => x.id === dragSourceId);
      const toIndex = mergeItems.findIndex((x) => x.id === item.id);
      if (fromIndex < 0 || toIndex < 0) return;
      const [moved] = mergeItems.splice(fromIndex, 1);
      mergeItems.splice(toIndex, 0, moved);
      renderMergeGrid();
      updateStatus("병합 순서를 변경했습니다.");
    });

    const order = document.createElement("div");
    order.className = "merge-order";
    order.textContent = String(index + 1);

    const icon = document.createElement("div");
    icon.className = "merge-icon";
    icon.textContent = "📄";

    const name = document.createElement("div");
    name.className = "merge-name";
    name.textContent = baseName(item.name);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      mergeItems.splice(index, 1);
      renderMergeGrid();
      updateStatus("병합 목록에서 파일을 삭제했습니다.");
    });

    card.appendChild(order);
    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(removeBtn);
    mergeGrid.appendChild(card);
  });
}

function addToConvert(files) {
  const incoming = Array.from(files);
  incoming.forEach((file) => {
    convertItems.push({
      id: crypto.randomUUID(),
      file,
      status: "대기 중",
      pdfBytes: null,
      downloadUrl: null,
      movedToMerge: false,
    });
  });
  renderConvertList();
  updateStatus(`${incoming.length}개 파일을 변환 영역에 추가했습니다.`);
}

async function addPdfFileToMerge(file, bytesOverride = null) {
  const lower = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
  if (!isPdf && !bytesOverride) return false;

  const bytes = bytesOverride || (await file.arrayBuffer());
  mergeItems.push({
    id: crypto.randomUUID(),
    name: lower.endsWith(".pdf") ? file.name : `${baseName(file.name)}.pdf`,
    pdfBytes: bytes,
  });
  return true;
}

async function addToMerge(files) {
  const incoming = Array.from(files);
  let added = 0;
  for (let i = 0; i < incoming.length; i += 1) {
    const ok = await addPdfFileToMerge(incoming[i]);
    if (ok) added += 1;
  }
  renderMergeGrid();
  updateStatus(`병합 영역에 PDF ${added}개를 추가했습니다.`);
}

function bindDropZone(zone, onFiles) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("dragover");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    onFiles(files);
  });
}

async function convertAll() {
  if (convertItems.length === 0) {
    updateStatus("변환할 파일이 없습니다.");
    return;
  }
  setBusyState(true);
  updateStatus("파일을 PDF로 변환 중...");

  let successCount = 0;
  for (let i = 0; i < convertItems.length; i += 1) {
    const item = convertItems[i];
    item.status = "변환 중";
    renderConvertList();

    try {
      const bytes = await convertFileToPdfBytes(item.file);
      item.pdfBytes = bytes;
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      item.downloadUrl = makePdfBlobUrl(bytes);
      item.status = "변환 완료";
      item.movedToMerge = false;
      successCount += 1;
    } catch (error) {
      item.status = `실패 - ${error.message}`;
      item.pdfBytes = null;
      item.movedToMerge = false;
    }
    renderConvertList();
  }

  setBusyState(false);
  updateStatus(`변환 완료: ${successCount}/${convertItems.length}`);
}

async function moveConvertedToMerge() {
  const movable = convertItems.filter((item) => item.pdfBytes && !item.movedToMerge);
  if (movable.length === 0) {
    updateStatus("병합으로 이동할 변환 완료 파일이 없습니다.");
    return;
  }

  movable.forEach((item) => {
    mergeItems.push({
      id: crypto.randomUUID(),
      name: `${baseName(item.file.name)}.pdf`,
      pdfBytes: item.pdfBytes,
    });
    item.movedToMerge = true;
    item.status = "변환 완료 (병합 목록 이동됨)";
  });

  renderConvertList();
  renderMergeGrid();
  updateStatus(`${movable.length}개 변환 파일을 병합 영역으로 이동했습니다.`);
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

async function mergeByOrder() {
  if (mergeItems.length === 0) {
    updateStatus("병합할 PDF가 없습니다.");
    return;
  }
  setBusyState(true);
  updateStatus("PDF를 순서대로 병합 중...");

  try {
    const mergedPdf = await PDFLib.PDFDocument.create();
    for (let i = 0; i < mergeItems.length; i += 1) {
      const src = await PDFLib.PDFDocument.load(mergeItems[i].pdfBytes);
      const pages = await mergedPdf.copyPages(src, src.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
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

function clearConvertList() {
  convertItems.forEach((item) => {
    if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
  });
  convertItems.length = 0;
  renderConvertList();
  updateStatus("변환 목록을 비웠습니다.");
}

function clearMergeList() {
  mergeItems.length = 0;
  renderMergeGrid();
  updateStatus("병합 목록을 비웠습니다.");
}

pickConvertBtn.addEventListener("click", () => convertInput.click());
pickMergeBtn.addEventListener("click", () => mergeInput.click());
convertInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (files && files.length > 0) addToConvert(files);
  convertInput.value = "";
});
mergeInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (files && files.length > 0) addToMerge(files);
  mergeInput.value = "";
});

bindDropZone(convertDrop, addToConvert);
bindDropZone(mergeDrop, addToMerge);

convertAllBtn.addEventListener("click", convertAll);
moveToMergeBtn.addEventListener("click", moveConvertedToMerge);
mergeBtn.addEventListener("click", mergeByOrder);
clearConvertBtn.addEventListener("click", clearConvertList);
clearMergeBtn.addEventListener("click", clearMergeList);

renderConvertList();
renderMergeGrid();
