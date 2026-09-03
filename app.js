const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const subCount = (g) => (g <= 3 ? 4 : 5);

const gradeEl = document.getElementById("grade");
const sectionEl = document.getElementById("section");
const photoZone = document.getElementById("photo-zone");
const photoBtn = document.getElementById("photo-btn");
const photoInput = document.getElementById("photo-input");
const submitBtn = document.getElementById("submit-btn");
const statusMsg = document.getElementById("status-msg");
const form = document.getElementById("checkin-form");

let photoBlob = null;

const todayStr = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};
document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-GB", {
  weekday: "long", day: "numeric", month: "long",
});

gradeEl.addEventListener("change", () => {
  const g = parseInt(gradeEl.value, 10);
  sectionEl.innerHTML = `<option value="" disabled selected>Select section</option>`;
  for (let s = 1; s <= subCount(g); s++) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = `Section ${s}`;
    sectionEl.appendChild(opt);
  }
  sectionEl.disabled = false;
  updateSubmitState();
});
sectionEl.addEventListener("change", updateSubmitState);

function compressImage(file, maxDim = 900, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function resetPhotoZone() {
  photoZone.classList.remove("has-photo");
  photoZone.innerHTML = `
    <button type="button" class="photo-btn" id="photo-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      Take / choose photo
    </button>
    <input type="file" id="photo-input" accept="image/*" capture="environment" />`;
  wirePhotoInput();
}

function wirePhotoInput() {
  const btn = document.getElementById("photo-btn");
  const input = document.getElementById("photo-input");
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    photoBlob = await compressImage(file);
    const url = URL.createObjectURL(photoBlob);
    photoZone.classList.add("has-photo");
    photoZone.innerHTML = `<img class="photo-preview" src="${url}" alt="" />`;
    const retakeBtn = document.createElement("button");
    retakeBtn.type = "button";
    retakeBtn.className = "photo-btn retake";
    retakeBtn.style.borderRadius = "0";
    retakeBtn.textContent = "Retake photo";
    retakeBtn.addEventListener("click", () => document.getElementById("photo-input").click());
    photoZone.appendChild(retakeBtn);
    updateSubmitState();
  });
}
wirePhotoInput();

function updateSubmitState() {
  submitBtn.disabled = !(gradeEl.value && sectionEl.value && photoBlob);
}

function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg show ${type}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span> Uploading…`;
  showStatus("", "");

  const grade = parseInt(gradeEl.value, 10);
  const sub = parseInt(sectionEl.value, 10);
  const groupId = `M${grade}-${sub}`;
  const label = `M.${grade}/${sub}`;
  const date = todayStr();
  const path = `${date}/${groupId}.jpg`;

  try {
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(path, photoBlob, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);

    const { error: dbError } = await supabase.from("entries").upsert(
      {
        group_id: groupId,
        grade,
        sub,
        label,
        entry_date: date,
        photo_url: pub.publicUrl,
      },
      { onConflict: "group_id,entry_date" }
    );
    if (dbError) throw dbError;

    showStatus(`✓ ${label} checked in!`, "success");
    form.reset();
    photoBlob = null;
    sectionEl.innerHTML = `<option value="" disabled selected>Select grade first</option>`;
    sectionEl.disabled = true;
    resetPhotoZone();
  } catch (err) {
    showStatus("Upload failed — check your connection and try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
    updateSubmitState();
  }
});
