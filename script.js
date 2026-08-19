const state = {
  before: { dataUrl: null, source: null },
  after: { dataUrl: null, source: null }
};

const els = {
  beforeInput: document.getElementById("beforeInput"),
  afterInput: document.getElementById("afterInput"),
  beforeBox: document.getElementById("beforeBox"),
  afterBox: document.getElementById("afterBox"),
  beforeImage: document.getElementById("beforeImage"),
  afterImage: document.getElementById("afterImage"),
  beforeEdit: document.getElementById("beforeEdit"),
  afterEdit: document.getElementById("afterEdit"),
  modal: document.getElementById("editorModal"),
  editorImage: document.getElementById("editorImage"),
  cropFrame: document.getElementById("cropFrame"),
  editorTitle: document.getElementById("editorTitle"),
  zoomRange: document.getElementById("zoomRange"),
  clientName: document.getElementById("clientName"),
  clientId: document.getElementById("clientId")
};

let editingSide = null;
let editor = { image: null, scale: 1, rotation: 0, x: 0, y: 0, startX: 0, startY: 0, dragging: false };

function readFile(file, side) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = e => openEditor(side, e.target.result, false);
  reader.readAsDataURL(file);
}

els.beforeInput.addEventListener("change", e => readFile(e.target.files[0], "before"));
els.afterInput.addEventListener("change", e => readFile(e.target.files[0], "after"));

els.beforeEdit.addEventListener("click", e => { e.stopPropagation(); openEditor("before", state.before.dataUrl, true); });
els.afterEdit.addEventListener("click", e => { e.stopPropagation(); openEditor("after", state.after.dataUrl, true); });

function openEditor(side, dataUrl, existing) {
  editingSide = side;
  editor = { image: new Image(), scale: existing ? 1 : 1, rotation: 0, x: 0, y: 0, startX: 0, startY: 0, dragging: false };
  els.editorTitle.textContent = side === "before" ? "Edit Before Photo" : "Edit After Photo";
  els.zoomRange.value = 1;
  editor.image.onload = () => {
    // The editor modal must be visible before measuring the crop frame.
    // Otherwise clientWidth/clientHeight are 0 and the image gets a 0 scale.
    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      fitEditorImage();
      updateEditorTransform();
    });
  };
  editor.image.src = dataUrl;
}

function fitEditorImage() {
  const frame = els.cropFrame;
  const fw = frame.clientWidth;
  const fh = frame.clientHeight;

  const iw = editor.image.naturalWidth;
  const ih = editor.image.naturalHeight;

  // 显示完整照片，不要一开始就裁掉
  editor.baseScale = Math.min(
    fw / iw,
    fh / ih
  );

  editor.scale = 1;
  editor.x = 0;
  editor.y = 0;
  editor.rotation = 0;

  els.editorImage.src = editor.image.src;
}

function updateEditorTransform() {
  const s = editor.baseScale * editor.scale;
  els.editorImage.style.width = `${editor.image.naturalWidth}px`;
  els.editorImage.style.height = `${editor.image.naturalHeight}px`;
  els.editorImage.style.transform =
    `translate(calc(-50% + ${editor.x}px), calc(-50% + ${editor.y}px)) rotate(${editor.rotation}deg) scale(${s})`;
}

els.zoomRange.addEventListener("input", () => {
  editor.scale = Number(els.zoomRange.value);
  updateEditorTransform();
});
document.getElementById("zoomOut").onclick = () => {
  editor.scale = Math.max(1, editor.scale - .1);
  els.zoomRange.value = editor.scale; updateEditorTransform();
};
document.getElementById("zoomIn").onclick = () => {
  editor.scale = Math.min(3, editor.scale + .1);
  els.zoomRange.value = editor.scale; updateEditorTransform();
};
document.getElementById("rotateBtn").onclick = () => {
  editor.rotation = (editor.rotation + 90) % 360;
  updateEditorTransform();
};
document.getElementById("resetBtn").onclick = () => {
  els.zoomRange.value = 1; editor.scale = 1; editor.rotation = 0; editor.x = 0; editor.y = 0;
  updateEditorTransform();
};

function pointerDown(e) {
  e.preventDefault();
  editor.dragging = true;
  editor.startX = e.clientX - editor.x;
  editor.startY = e.clientY - editor.y;
  els.editorImage.classList.add("dragging");
  els.cropFrame.setPointerCapture?.(e.pointerId);
}
function pointerMove(e) {
  if (!editor.dragging) return;
  editor.x = e.clientX - editor.startX;
  editor.y = e.clientY - editor.startY;
  updateEditorTransform();
}
function pointerUp() {
  editor.dragging = false;
  els.editorImage.classList.remove("dragging");
}
els.cropFrame.addEventListener("pointerdown", pointerDown);
els.cropFrame.addEventListener("pointermove", pointerMove);
els.cropFrame.addEventListener("pointerup", pointerUp);
els.cropFrame.addEventListener("pointercancel", pointerUp);

els.cropFrame.addEventListener("wheel", e => {
  e.preventDefault();
  editor.scale = Math.max(1, Math.min(3, editor.scale + (e.deltaY < 0 ? .08 : -.08)));
  els.zoomRange.value = editor.scale; updateEditorTransform();
}, {passive:false});

document.getElementById("saveEdit").onclick = async () => {
  const dataUrl = renderCrop();
  state[editingSide].dataUrl = dataUrl;
  state[editingSide].source = dataUrl;
  const img = editingSide === "before" ? els.beforeImage : els.afterImage;
  const box = editingSide === "before" ? els.beforeBox : els.afterBox;
  img.src = dataUrl;
  box.classList.remove("empty");
  box.classList.add("has-photo");
  closeEditor();
};
document.getElementById("cancelEdit").onclick = closeEditor;
document.getElementById("editorClose").onclick = closeEditor;
els.modal.addEventListener("click", e => { if (e.target === els.modal) closeEditor(); });

function closeEditor() {
  els.modal.classList.remove("open");
  els.modal.setAttribute("aria-hidden", "true");
}

function renderCrop() {
  const frame = els.cropFrame;
  const outW = 1200, outH = 1500;
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111"; ctx.fillRect(0,0,outW,outH);

  const fw = frame.clientWidth, fh = frame.clientHeight;
  const scaleToOutput = outW / fw;
  const s = editor.baseScale * editor.scale;
  const imgW = editor.image.naturalWidth * s;
  const imgH = editor.image.naturalHeight * s;

  ctx.save();
  ctx.translate(outW/2 + editor.x * scaleToOutput, outH/2 + editor.y * scaleToOutput);
  ctx.rotate(editor.rotation * Math.PI / 180);
  ctx.drawImage(editor.image, -imgW*scaleToOutput/2, -imgH*scaleToOutput/2,
                imgW*scaleToOutput, imgH*scaleToOutput);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", .94);
}

document.getElementById("clearBtn").onclick = () => {
  state.before = {dataUrl:null,source:null}; state.after = {dataUrl:null,source:null};
  [els.beforeBox, els.afterBox].forEach(b => { b.classList.remove("has-photo"); b.classList.add("empty"); });
  [els.beforeImage, els.afterImage].forEach(i => i.removeAttribute("src"));
  els.beforeInput.value = ""; els.afterInput.value = "";
};

document.getElementById("downloadBtn").onclick = async () => {

  if (!state.before.dataUrl || !state.after.dataUrl) {
    alert("Please upload both Before and After photos first.");
    return;
  }

  // =========================================
  // HIGH RESOLUTION DOWNLOAD
  // =========================================

  const canvas = document.createElement("canvas");

  const W = 2600;
  const H = 2050;

  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#f7f3ed";
  ctx.fillRect(0, 0, W, H);


  // =========================================
  // LOGO - TOP LEFT
  // =========================================

  const logo = document.getElementById("companyLogo");

  if (logo && logo.complete && logo.naturalWidth) {

    const maxLogoW = 400;
    const maxLogoH = 150;

    const logoRatio = Math.min(
      maxLogoW / logo.naturalWidth,
      maxLogoH / logo.naturalHeight
    );

    const logoW = logo.naturalWidth * logoRatio;
    const logoH = logo.naturalHeight * logoRatio;

    ctx.drawImage(
      logo,
      80,
      55,
      logoW,
      logoH
    );

  } else {

    ctx.fillStyle = "#b08a2e";
    ctx.textAlign = "left";
    ctx.font = "700 62px Arial";

    ctx.fillText(
      "FUZION",
      80,
      110
    );
  }


  // =========================================
  // HEADER - CENTER
  // =========================================

  ctx.textAlign = "center";

  ctx.fillStyle = "#27231f";

  ctx.font = "600 58px Georgia";

  ctx.fillText(
    "BEFORE & AFTER",
    W / 2,
    115
  );


  // =========================================
  // CLIENT NAME + ID
  // =========================================

  const name = els.clientName.value.trim();
  const id = els.clientId.value.trim();

  let clientText = "";

  if (name) {
    clientText += "Client: " + name;
  }

  if (name && id) {
    clientText += "     •     ";
  }

  if (id) {
    clientText += "ID: " + id;
  }

  ctx.fillStyle = "#5f574f";

  // Larger client information
  ctx.font = "600 40px Arial";

  ctx.fillText(
    clientText,
    W / 2,
    180
  );


  // =========================================
  // PHOTO POSITION
  // =========================================

  const margin = 90;

  const gap = 40;

  // Photos moved lower
  const top = 240;

  const photoW =
    (W - margin * 2 - gap) / 2;

  const photoH =
    photoW * 1.25;


  // =========================================
  // BEFORE PHOTO
  // =========================================

  await drawCover(
    ctx,
    state.before.dataUrl,
    margin,
    top,
    photoW,
    photoH
  );


  // =========================================
  // AFTER PHOTO
  // =========================================

  await drawCover(
    ctx,
    state.after.dataUrl,
    margin + photoW + gap,
    top,
    photoW,
    photoH
  );


  // =========================================
  // BEFORE / AFTER LABEL
  // =========================================

  ctx.fillStyle = "#9c8060";

  ctx.font = "700 29px Arial";

  ctx.textAlign = "center";

  ctx.fillText(
    "BEFORE",
    margin + photoW / 2,
    top + photoH + 52
  );

  ctx.fillText(
    "AFTER",
    margin + photoW + gap + photoW / 2,
    top + photoH + 52
  );


  // =========================================
  // FOOTER
  // =========================================

  ctx.textAlign = "center";

  // Company name
  ctx.fillStyle = "#27231f";

  ctx.font = "700 34px Arial";

  ctx.fillText(
    "FUZION HAIR CARE",
    W / 2,
    H - 135
  );


  // Address + phone
  ctx.fillStyle = "#6f675f";

  ctx.font = "600 25px Arial";

  const companyInfo =
    document
      .getElementById("companyInfo")
      .textContent
      .trim();

  ctx.fillText(
    companyInfo,
    W / 2,
    H - 88
  );


  // =========================================
  // DOWNLOAD
  // =========================================

  const link = document.createElement("a");

  link.download =
    `Fuzion_Before_After_${(
      name || "Client"
    ).replace(/[^\w-]+/g, "_")}.jpg`;

  link.href =
    canvas.toDataURL(
      "image/jpeg",
      0.98
    );

  link.click();
};

function drawCover(ctx, dataUrl, x,y,w,h) {
  return new Promise(resolve => {
    const img=new Image();
    img.onload=()=>{
      const r=Math.max(w/img.naturalWidth,h/img.naturalHeight);
      const dw=img.naturalWidth*r, dh=img.naturalHeight*r;
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
      ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
      ctx.restore(); resolve();
    };
    img.src=dataUrl;
  });
}
