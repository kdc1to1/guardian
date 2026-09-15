// js/app.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, query, where, orderBy,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------------------------------------------------
   NAVIGATION
--------------------------------------------------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.go === id);
  });
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const goEl = e.target.closest("[data-go]");
  if (goEl) showScreen(goEl.dataset.go);
});
document.getElementById("goRegister").addEventListener("click", () => showScreen("screen-register"));
document.getElementById("backFromRegister").addEventListener("click", () => showScreen("screen-login"));

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------------------------------------------------------
   AUTH: EMAIL + PASSWORD (LOGIN) — fully free on Spark plan
--------------------------------------------------------- */
function normalizePhone(v) {
  return v.trim().replace(/\s|-/g, "");
}

document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginEmailErr");
  errEl.textContent = "";
  if (!email || !pw) { errEl.textContent = "ইমেইল ও পাসওয়ার্ড দিন"; return; }
  try {
    const result = await signInWithEmailAndPassword(auth, email, pw);
    await loadGuardianAndEnter(result.user.uid);
  } catch (err) {
    errEl.textContent = "লগইন ব্যর্থ: ইমেইল বা পাসওয়ার্ড ভুল";
  }
});

document.getElementById("goForgotPw").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) { toast("প্রথমে ইমেইল লিখুন"); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast("পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে");
  } catch (err) {
    toast("সমস্যা হয়েছে: " + err.message);
  }
});

/* ---------------------------------------------------------
   REGISTRATION
--------------------------------------------------------- */
document.getElementById("regRelation").addEventListener("change", (e) => {
  const isFather = e.target.value === "father";
  document.getElementById("regGuardianNameLabel").textContent =
    isFather ? "পিতার নাম (আপনি) *" : "মাতার নাম (আপনি) *";
  document.getElementById("regOtherParentLabel").textContent =
    isFather ? "মাতার নাম" : "পিতার নাম";
});

function isChildAgeValid(dobStr) {
  const dob = new Date(dobStr);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
  return years <= 5 && years >= 0;
}

document.getElementById("btnRegisterSubmit").addEventListener("click", async () => {
  const errEl = document.getElementById("registerErr");
  errEl.textContent = "";

  const dob = document.getElementById("regChildDob").value;
  if (!dob || !isChildAgeValid(dob)) {
    document.getElementById("dobErr").textContent = "শিশুর বয়স ৫ বছরের বেশি হলে রেজিস্ট্রেশন করা যাবে না";
    return;
  }
  document.getElementById("dobErr").textContent = "";

  const whatsapp = normalizePhone(document.getElementById("regWhatsapp").value);
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  const registration = {
    childName: document.getElementById("regChildName").value.trim(),
    childDob: dob,
    childGender: document.getElementById("regChildGender").value,
    relation: document.getElementById("regRelation").value,
    guardianName: document.getElementById("regGuardianName").value.trim(),
    otherParentName: document.getElementById("regOtherParentName").value.trim(),
    whatsapp,
    email,
    currentAddress: document.getElementById("regCurrentAddress").value.trim(),
    permanentAddress: document.getElementById("regPermanentAddress").value.trim(),
  };
  if (!registration.childName || !registration.relation || !registration.guardianName || !email || !password) {
    errEl.textContent = "* চিহ্নিত ঘরগুলো ও ইমেইল/পাসওয়ার্ড পূরণ করুন";
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "পাসওয়ার্ড কমপক্ষে ৬ ডিজিট/অক্ষরের হতে হবে";
    return;
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const uid = result.user.uid;

    await setDoc(doc(db, "guardians", uid), {
      guardianName: registration.guardianName,
      relation: registration.relation,
      otherParentName: registration.otherParentName,
      whatsapp: registration.whatsapp,
      email: registration.email,
      currentAddress: registration.currentAddress,
      permanentAddress: registration.permanentAddress,
      isPremium: false,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, "children"), {
      guardianUid: uid,
      name: registration.childName,
      dob: registration.childDob,
      gender: registration.childGender,
      level: "শুরু",
      createdAt: serverTimestamp(),
    });

    toast("রেজিস্ট্রেশন সম্পন্ন হয়েছে");
    await loadGuardianAndEnter(uid);
  } catch (err) {
    errEl.textContent = "রেজিস্ট্রেশন ব্যর্থ: " + err.message;
  }
});

/* ---------------------------------------------------------
   SESSION / GUARDIAN STATE
--------------------------------------------------------- */
let currentGuardianUid = null;
let currentGuardianData = null;

async function loadGuardianAndEnter(uid) {
  currentGuardianUid = uid;
  const snap = await getDoc(doc(db, "guardians", uid));
  currentGuardianData = snap.exists() ? snap.data() : null;

  document.getElementById("topbar").style.display = "flex";
  document.getElementById("bottomNav").style.display = "flex";

  if (currentGuardianData) {
    document.getElementById("guardianGreetName").textContent = currentGuardianData.guardianName;
    document.getElementById("greetTitle").textContent = "সালাম, " + currentGuardianData.guardianName;
    updatePremiumUI(currentGuardianData.isPremium);
  }

  showScreen("screen-dashboard");
  watchPaymentRequests();
  watchMyOrders();
}

function updatePremiumUI(isPremium) {
  const banner = document.getElementById("premiumBanner");
  if (isPremium) {
    document.getElementById("premiumTitle").textContent = "প্রিমিয়াম সদস্য ✨";
    document.getElementById("premiumSub").textContent = "সব কনটেন্ট আনলক করা আছে";
    document.getElementById("btnGoPremium").style.display = "none";
  } else {
    document.getElementById("premiumTitle").textContent = "ফ্রি ভার্সন ব্যবহার করছেন";
    document.getElementById("premiumSub").textContent = "সব কনটেন্ট আনলক করতে প্রিমিয়ামে যান";
    document.getElementById("btnGoPremium").style.display = "block";
  }
}
document.getElementById("btnGoPremium").addEventListener("click", () => showScreen("screen-premium"));

/* ---------------------------------------------------------
   CONTENT: ACTIVITIES / POEMS / STORIES / TOOLS / KNOW-KIDS
--------------------------------------------------------- */
function renderCard(item, kind) {
  const locked = !item.isFree && !(currentGuardianData && currentGuardianData.isPremium);
  const div = document.createElement("div");
  div.className = "content-card" + (locked ? " locked-card" : "");
  let metaLine = "";
  let actionsHtml = "";

  if (kind === "activity") {
    metaLine = item.developmentArea || "";
    actionsHtml = `<button data-detail="activity" data-id="${item.id}">বিস্তারিত দেখুন</button>`;
  } else if (kind === "poem") {
    metaLine = item.poet ? "কবি: " + item.poet : "";
    actionsHtml = `<button data-detail="poem" data-id="${item.id}">দেখুন</button>`;
  } else if (kind === "story") {
    metaLine = item.author ? "লেখক: " + item.author : "";
    actionsHtml = `<button data-detail="story" data-id="${item.id}">দেখুন</button>`;
  }

  div.innerHTML = `
    <span class="badge ${locked ? "locked" : "free"}">${locked ? "প্রিমিয়াম" : "ফ্রি"}</span>
    <h3>${item.title}</h3>
    <div class="meta">${metaLine}</div>
    <div class="actions">${actionsHtml}</div>
  `;
  return div;
}

function watchCollection(colName, listElId, kind) {
  const listEl = document.getElementById(listElId);
  const q = query(collection(db, colName), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state"><div class="e">🗂️</div>এখনো কোনো কনটেন্ট যুক্ত হয়নি</div>`;
      return;
    }
    snap.forEach(docSnap => {
      const item = { id: docSnap.id, ...docSnap.data() };
      window.__contentCache = window.__contentCache || {};
      window.__contentCache[item.id] = item;
      listEl.appendChild(renderCard(item, kind));
    });
  });
}
watchCollection("activities", "activitiesList", "activity");
watchCollection("poems", "poemsList", "poem");
watchCollection("stories", "storiesList", "story");

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-detail]");
  if (!btn) return;
  const item = window.__contentCache[btn.dataset.id];
  if (!item) return;
  const locked = !item.isFree && !(currentGuardianData && currentGuardianData.isPremium);
  if (locked) { toast("এই কনটেন্টটি প্রিমিয়ামে আনলক করুন"); showScreen("screen-premium"); return; }

  let html = `<h2 style="margin-bottom:10px;">${item.title}</h2>`;
  if (btn.dataset.detail === "activity") {
    html += `<p><strong>ডেভেলপমেন্ট এরিয়া:</strong> ${item.developmentArea || "-"}</p>`;
    html += `<div class="rules-box"><strong>খেলার নিয়ম</strong>${item.rules || "-"}</div>`;
    if (item.imageDriveLink) html += `<p><a href="${item.imageDriveLink}" target="_blank">📷 ছবি দেখুন</a></p>`;
    if (item.videoYoutubeLink) html += `<p><a href="${item.videoYoutubeLink}" target="_blank">🎬 ভিডিও দেখুন</a></p>`;
    html += `<button class="btn-primary" id="btnGoToolsFromActivity" data-activity-id="${item.id}" style="margin-top:10px;">এই খেলার টুলস কিনুন</button>`;
  } else {
    html += `<p>${item.learningOutcome || ""}</p>`;
  }
  document.getElementById("detailModalBody").innerHTML = html;
  document.getElementById("detailModal").classList.add("active");
});
document.getElementById("closeDetailModal").addEventListener("click", () => document.getElementById("detailModal").classList.remove("active"));

document.addEventListener("click", (e) => {
  const goBtn = e.target.closest("#btnGoToolsFromActivity");
  if (!goBtn) return;
  document.getElementById("detailModal").classList.remove("active");
  const activityId = goBtn.dataset.activityId;
  const linkedTool = Object.values(window.__toolsCache || {}).find(t => t.linkedActivityId === activityId);
  showScreen("screen-tools");
  if (linkedTool) {
    activeOrderTool = linkedTool;
    document.getElementById("orderAddress").value = (currentGuardianData && currentGuardianData.currentAddress) || "";
    document.getElementById("orderWhatsapp").value = (currentGuardianData && currentGuardianData.whatsapp) || "";
    document.getElementById("orderModal").classList.add("active");
  }
});

/* Poem / story common rules + know-kids content (single docs under siteContent) */
onSnapshot(doc(db, "siteContent", "rules"), (snap) => {
  const d = snap.data() || {};
  document.getElementById("poemRulesText").textContent = d.poemRules || "এখনো নিয়ম যুক্ত করা হয়নি";
  document.getElementById("storyRulesText").textContent = d.storyRules || "এখনো নিয়ম যুক্ত করা হয়নি";
});
onSnapshot(doc(db, "siteContent", "knowKids"), (snap) => {
  const d = snap.data() || {};
  document.getElementById("marqueeText").textContent = d.marqueeText || "শিশুদের সুষ্ঠুভাবে গড়ে তুলুন; আগামী পৃথিবী সুন্দর করুন";
  const linkEl = document.getElementById("knowKidsArticleLink");
  linkEl.textContent = (d.wordpressTitle || "নিবন্ধ পড়তে এখানে ক্লিক করুন") + " →";
  linkEl.href = d.wordpressLink || "#";
});

/* ---------------------------------------------------------
   TOOLS + ORDERS
--------------------------------------------------------- */
let activeOrderTool = null;
onSnapshot(query(collection(db, "tools"), orderBy("createdAt", "desc")), (snap) => {
  const listEl = document.getElementById("toolsList");
  listEl.innerHTML = "";
  if (snap.empty) { listEl.innerHTML = `<div class="empty-state"><div class="e">🧸</div>এখনো কোনো টুলস যুক্ত হয়নি</div>`; return; }
  snap.forEach(docSnap => {
    const t = { id: docSnap.id, ...docSnap.data() };
    window.__toolsCache = window.__toolsCache || {};
    window.__toolsCache[t.id] = t;
    const div = document.createElement("div");
    div.className = "content-card";
    div.innerHTML = `
      <h3>${t.name}</h3>
      <div class="meta">মূল্য: ৳${t.price || "-"} ${t.materials ? "· উপকরণ: " + t.materials : ""}</div>
      <div class="actions">
        <button data-tool-detail="${t.id}">বিস্তারিত</button>
        <button data-order="${t.id}">কিনুন</button>
      </div>`;
    listEl.appendChild(div);
  });
});
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-tool-detail]");
  if (d) {
    const t = window.__toolsCache[d.dataset.toolDetail];
    document.getElementById("detailModalBody").innerHTML = `
      <h2>${t.name}</h2>
      <p><strong>মূল্য:</strong> ৳${t.price || "-"}</p>
      <p><strong>আইটেম:</strong> ${t.itemsDetails || "-"}</p>
      <p><strong>তৈরির উপকরণ:</strong> ${t.materials || "-"}</p>`;
    document.getElementById("detailModal").classList.add("active");
  }
  const o = e.target.closest("[data-order]");
  if (o) {
    activeOrderTool = window.__toolsCache[o.dataset.order];
    document.getElementById("orderAddress").value = (currentGuardianData && currentGuardianData.currentAddress) || "";
    document.getElementById("orderWhatsapp").value = (currentGuardianData && currentGuardianData.whatsapp) || "";
    document.getElementById("orderModal").classList.add("active");
  }
});
document.getElementById("closeOrderModal").addEventListener("click", () => document.getElementById("orderModal").classList.remove("active"));
document.getElementById("goMyOrders").addEventListener("click", (e) => { e.preventDefault(); showScreen("screen-orders"); });
document.getElementById("btnConfirmOrder").addEventListener("click", async () => {
  if (!activeOrderTool || !currentGuardianUid) return;
  await addDoc(collection(db, "orders"), {
    guardianUid: currentGuardianUid,
    toolId: activeOrderTool.id,
    toolName: activeOrderTool.name,
    price: activeOrderTool.price || 0,
    quantity: Number(document.getElementById("orderQty").value) || 1,
    address: document.getElementById("orderAddress").value.trim(),
    whatsapp: document.getElementById("orderWhatsapp").value.trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  });
  document.getElementById("orderModal").classList.remove("active");
  toast("অর্ডার পাঠানো হয়েছে, এডমিন কনফার্ম করবেন");
});

/* ---------------------------------------------------------
   SHISHU MELA
--------------------------------------------------------- */
onSnapshot(query(collection(db, "children"), where("level", "!=", null)), (snap) => {
  const listEl = document.getElementById("melaList");
  listEl.innerHTML = "";
  if (snap.empty) { listEl.innerHTML = `<div class="empty-state"><div class="e">🏅</div>এখনো কোনো শিশু তালিকাভুক্ত হয়নি</div>`; return; }
  snap.forEach(docSnap => {
    const c = docSnap.data();
    const div = document.createElement("div");
    div.className = "content-card";
    div.innerHTML = `<h3>${c.name}</h3><div class="meta">লেভেল: ${c.level || "শুরু"}</div>`;
    listEl.appendChild(div);
  });
});

/* ---------------------------------------------------------
   PAYMENT REQUESTS
--------------------------------------------------------- */
document.getElementById("btnSubmitPayment").addEventListener("click", async () => {
  const trxId = document.getElementById("payTrxId").value.trim();
  if (!trxId) { toast("ট্রানজেকশন আইডি দিন"); return; }
  await addDoc(collection(db, "paymentRequests"), {
    guardianUid: currentGuardianUid,
    method: document.getElementById("payMethod").value,
    transactionId: trxId,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  document.getElementById("payTrxId").value = "";
  toast("রিকুয়েস্ট পাঠানো হয়েছে, এডমিন যাচাই করবেন");
});

function watchPaymentRequests() {
  if (!currentGuardianUid) return;
  const q = query(collection(db, "paymentRequests"), where("guardianUid", "==", currentGuardianUid), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const el = document.getElementById("paymentHistory");
    el.innerHTML = "<h3 style='margin-bottom:10px;'>আপনার রিকুয়েস্টসমূহ</h3>";
    snap.forEach(d => {
      const r = d.data();
      const pillClass = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
      const pillTxt = r.status === "approved" ? "অ্যাপ্রুভড" : r.status === "rejected" ? "বাতিল" : "অপেক্ষমান";
      el.innerHTML += `<div class="content-card"><div class="meta">${r.method} · ${r.transactionId}</div><span class="pill ${pillClass}">${pillTxt}</span></div>`;
    });
  });
  // also refresh premium flag live
  onSnapshot(doc(db, "guardians", currentGuardianUid), (snap) => {
    if (snap.exists()) {
      currentGuardianData = snap.data();
      updatePremiumUI(currentGuardianData.isPremium);
    }
  });
}

/* ---------------------------------------------------------
   MY ORDERS + RECEIPT (image / PDF / share)
--------------------------------------------------------- */
window.__myOrdersCache = window.__myOrdersCache || {};

function watchMyOrders() {
  if (!currentGuardianUid) return;
  const q = query(collection(db, "orders"), where("guardianUid", "==", currentGuardianUid), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const listEl = document.getElementById("myOrdersList");
    listEl.innerHTML = "";
    if (snap.empty) { listEl.innerHTML = `<div class="empty-state"><div class="e">📦</div>এখনো কোনো অর্ডার নেই</div>`; return; }
    snap.forEach(docSnap => {
      const o = { id: docSnap.id, ...docSnap.data() };
      window.__myOrdersCache[o.id] = o;
      const pillClass = o.status === "confirmed" ? "approved" : o.status === "cancelled" ? "rejected" : "pending";
      const pillTxt = o.status === "confirmed" ? "কনফার্মড" : o.status === "cancelled" ? "বাতিল" : "অপেক্ষমান";
      const div = document.createElement("div");
      div.className = "content-card";
      div.innerHTML = `
        <h3>${o.toolName}</h3>
        <div class="meta">পরিমাণ: ${o.quantity} · ৳${(o.price||0) * (o.quantity||1)}</div>
        <span class="pill ${pillClass}">${pillTxt}</span>
        <div class="actions"><button data-my-receipt="${o.id}">রশিদ দেখুন</button></div>`;
      listEl.appendChild(div);
    });
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-my-receipt]");
  if (btn) openReceipt(btn.dataset.myReceipt);
});

function openReceipt(orderId) {
  const o = window.__myOrdersCache[orderId];
  if (!o) return;
  const dateStr = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toLocaleDateString("bn-BD") : "";
  document.getElementById("receiptBody").innerHTML = `
    <p><strong>রশিদ নং:</strong> ${orderId.slice(0, 8).toUpperCase()}</p>
    <p><strong>তারিখ:</strong> ${dateStr}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:10px 0;">
    <p><strong>আইটেম:</strong> ${o.toolName}</p>
    <p><strong>পরিমাণ:</strong> ${o.quantity}</p>
    <p><strong>মূল্য/একক:</strong> ৳${o.price || "-"}</p>
    <p><strong>মোট:</strong> ৳${(o.price || 0) * (o.quantity || 1)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:10px 0;">
    <p><strong>ঠিকানা:</strong> ${o.address || "-"}</p>
    <p><strong>হোয়াটসএপ:</strong> ${o.whatsapp || "-"}</p>
    <p><strong>স্ট্যাটাস:</strong> ${o.status}</p>
  `;
  document.getElementById("receiptModal").classList.add("active");
}
document.getElementById("closeReceiptModal").addEventListener("click", () =>
  document.getElementById("receiptModal").classList.remove("active"));

async function renderReceiptCanvas() {
  return await html2canvas(document.getElementById("receiptTemplate"), { scale: 2, backgroundColor: "#ffffff" });
}
document.getElementById("btnDownloadReceiptImg").addEventListener("click", async () => {
  const canvas = await renderReceiptCanvas();
  const link = document.createElement("a");
  link.download = "receipt.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
document.getElementById("btnDownloadReceiptPdf").addEventListener("click", async () => {
  const canvas = await renderReceiptCanvas();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "px", format: [canvas.width / 2, canvas.height / 2] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
  pdf.save("receipt.pdf");
});
document.getElementById("btnShareReceipt").addEventListener("click", async () => {
  const canvas = await renderReceiptCanvas();
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "receipt.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "রশিদ", text: "Kids Development Center — ক্রয় রশিদ" });
        return;
      } catch (e) { /* cancelled or unsupported */ }
    }
    toast("এই ডিভাইসে সরাসরি শেয়ার সাপোর্ট নেই — ছবি ডাউনলোড করে হোয়াটসএপে সংযুক্ত করুন");
  }, "image/png");
});
