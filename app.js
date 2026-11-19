// js/app.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, orderBy,
  onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  KIND_ORDER, KIND_LABELS, KIND_COLLECTIONS, REPORT_STATUSES,
  statusInfo, toMillis, fmtDateTime, esc, sortContent, categorySummary
} from "./shared.js";

let isRegistering = false;

/* ---------------------------------------------------------
   NAVIGATION
--------------------------------------------------------- */
function showScreen(id) {
  if (id === "screen-profile") populateProfile();
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
function normalizeWhatsapp(v) {
  let s = (v || "").trim().replace(/[\s-]/g, "");
  if (!s) return s;
  if (s.startsWith("+880")) return s;
  if (s.startsWith("880")) return "+" + s;
  if (s.startsWith("0")) return "+880" + s.slice(1);
  if (s.startsWith("+")) return s;
  return "+880" + s;
}

document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginEmailErr");
  errEl.textContent = "";
  if (!email || !pw) { errEl.textContent = "ইমেইল ও পাসওয়ার্ড দিন"; return; }
  try {
    const result = await signInWithEmailAndPassword(auth, email, pw);
    const ok = await loadGuardianAndEnter(result.user.uid);
    if (!ok) errEl.textContent = "এই ইমেইলের কোনো গার্ডিয়ান প্রোফাইল পাওয়া যায়নি";
  } catch (err) {
    errEl.textContent = "লগইন ব্যর্থ: ইমেইল বা পাসওয়ার্ড ভুল";
  }
});

document.getElementById("goForgotPw").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) { toast("প্রথমে ইমেইল লিখুন"); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast("রিসেট লিংক ইমেইলে পাঠানো হয়েছে — ইনবক্সে না পেলে Spam/Junk ফোল্ডার চেক করুন");
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

  const whatsapp = normalizeWhatsapp(document.getElementById("regWhatsapp").value);
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  const registration = {
    childName: document.getElementById("regChildName").value.trim(),
    childDob: dob,
    childGender: document.getElementById("regChildGender").value,
    relation: document.getElementById("regRelation").value,
    guardianName: document.getElementById("regGuardianName").value.trim(),
    otherParentName: document.getElementById("regOtherParentName").value.trim(),
    fatherOccupation: document.getElementById("regFatherOccupation").value.trim(),
    motherOccupation: document.getElementById("regMotherOccupation").value.trim(),
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

  isRegistering = true;
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const uid = result.user.uid;

    await setDoc(doc(db, "guardians", uid), {
      guardianName: registration.guardianName,
      relation: registration.relation,
      otherParentName: registration.otherParentName,
      fatherOccupation: registration.fatherOccupation,
      motherOccupation: registration.motherOccupation,
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
  } finally {
    isRegistering = false;
  }
});

/* ---------------------------------------------------------
   SESSION / GUARDIAN STATE
--------------------------------------------------------- */
let currentGuardianUid = null;
let currentGuardianData = null;
let currentChildId = null;
let currentChildData = null;
let enteredUid = null;
let reportsByKey = {};

function isPremiumUser() {
  return !!(currentGuardianData && currentGuardianData.isPremium);
}

async function loadGuardianAndEnter(uid) {
  if (enteredUid === uid) return true;
  enteredUid = uid;
  const snap = await getDoc(doc(db, "guardians", uid));
  if (!snap.exists()) { enteredUid = null; return false; }

  currentGuardianUid = uid;
  currentGuardianData = snap.data();

  document.getElementById("topbar").style.display = "flex";
  document.getElementById("bottomNav").style.display = "flex";
  refreshGuardianUI();
  showScreen("screen-dashboard");

  watchGuardianDoc();
  watchPaymentRequests();
  watchMyOrders();
  loadMyChild();
  watchMyReports();
  renderAllContent();
  return true;
}

function refreshGuardianUI() {
  if (!currentGuardianData) return;
  document.getElementById("greetTitle").textContent = "সালাম, " + currentGuardianData.guardianName;
  updatePremiumUI(currentGuardianData.isPremium);
}

// প্রিমিয়াম স্ট্যাটাস লাইভ ট্র্যাক করা — অ্যাপ্রুভ হওয়ার সাথে সাথে সব কনটেন্ট আনলক হবে
function watchGuardianDoc() {
  onSnapshot(doc(db, "guardians", currentGuardianUid), (snap) => {
    if (!snap.exists()) return;
    const wasPremium = isPremiumUser();
    currentGuardianData = snap.data();
    refreshGuardianUI();
    renderAllContent();
    renderProgressSummary();
    if (!wasPremium && isPremiumUser()) toast("🎉 আপনার প্রিমিয়াম চালু হয়েছে — সব কনটেন্ট আনলক!");
  }, (err) => console.error("guardian doc", err));
}

function resetToLoggedOut() {
  enteredUid = null;
  currentGuardianUid = null;
  currentGuardianData = null;
  currentChildId = null;
  currentChildData = null;
  reportsByKey = {};
  document.getElementById("topbar").style.display = "none";
  document.getElementById("bottomNav").style.display = "none";
  const active = document.querySelector(".screen.active");
  if (!active || !["screen-login", "screen-register"].includes(active.id)) showScreen("screen-login");
}

// লগইন করা থাকলে রিলোড করলেও আবার আইডি-পাসওয়ার্ড লাগবে না (Firebase সেশন ব্রাউজারে সংরক্ষিত থাকে)
onAuthStateChanged(auth, async (user) => {
  try {
    if (isRegistering) return;
    if (user) {
      const ok = await loadGuardianAndEnter(user.uid);
      if (!ok) showScreen("screen-login");
    } else {
      resetToLoggedOut();
    }
  } catch (e) {
    console.error(e);
  } finally {
    document.getElementById("app").classList.remove("booting");
  }
});
setTimeout(() => document.getElementById("app").classList.remove("booting"), 4000);

function updatePremiumUI(isPremium) {
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
   PROFILE (এডিট) + LOGOUT
--------------------------------------------------------- */
document.getElementById("btnProfile").addEventListener("click", () => showScreen("screen-profile"));

function populateProfile() {
  if (!currentGuardianData) return;
  const g = currentGuardianData;
  const c = currentChildData || {};
  const isFather = g.relation === "father";
  document.getElementById("profGuardianNameLabel").textContent = isFather ? "পিতার নাম (আপনি)" : "মাতার নাম (আপনি)";
  document.getElementById("profOtherParentLabel").textContent = isFather ? "মাতার নাম" : "পিতার নাম";
  document.getElementById("profGuardianName").value = g.guardianName || "";
  document.getElementById("profOtherParentName").value = g.otherParentName || "";
  document.getElementById("profFatherOccupation").value = g.fatherOccupation || "";
  document.getElementById("profMotherOccupation").value = g.motherOccupation || "";
  document.getElementById("profWhatsapp").value = g.whatsapp || "";
  document.getElementById("profEmail").value = g.email || "";
  document.getElementById("profCurrentAddress").value = g.currentAddress || "";
  document.getElementById("profPermanentAddress").value = g.permanentAddress || "";
  document.getElementById("profChildName").value = c.name || "";
  document.getElementById("profChildDob").value = c.dob || "";
  document.getElementById("profChildGender").value = c.gender || "";
}

document.getElementById("btnSaveProfile").addEventListener("click", async () => {
  if (!currentGuardianUid) return;
  const guardianName = document.getElementById("profGuardianName").value.trim();
  const childName = document.getElementById("profChildName").value.trim();
  const childDob = document.getElementById("profChildDob").value;
  const childGender = document.getElementById("profChildGender").value;
  if (!guardianName || !childName) { toast("অভিভাবক ও শিশুর নাম লিখুন"); return; }
  if (childDob && currentChildData && childDob !== currentChildData.dob && !isChildAgeValid(childDob)) {
    toast("শিশুর বয়স ৫ বছরের বেশি হলে নিবন্ধন করা যাবে না"); return;
  }
  const updated = {
    guardianName,
    otherParentName: document.getElementById("profOtherParentName").value.trim(),
    fatherOccupation: document.getElementById("profFatherOccupation").value.trim(),
    motherOccupation: document.getElementById("profMotherOccupation").value.trim(),
    whatsapp: normalizeWhatsapp(document.getElementById("profWhatsapp").value),
    currentAddress: document.getElementById("profCurrentAddress").value.trim(),
    permanentAddress: document.getElementById("profPermanentAddress").value.trim(),
  };
  try {
    await updateDoc(doc(db, "guardians", currentGuardianUid), updated);
    if (currentChildId) {
      await updateDoc(doc(db, "children", currentChildId), { name: childName, dob: childDob, gender: childGender });
    }
    toast("প্রোফাইল আপডেট হয়েছে");
  } catch (err) {
    toast("সংরক্ষণ করা যায়নি: " + err.message);
  }
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
  location.reload(); // পরিষ্কার অবস্থা থেকে শুরু করতে পেজ রিলোড
});

/* ---------------------------------------------------------
   CONTENT: ফ্রি সবসময় উপরে, প্রতিটি কার্ডে রিপোর্ট ও আনলক বাটন
--------------------------------------------------------- */
const LIST_IDS = {
  activity: "activitiesList", poem: "poemsList", story: "storiesList", manner: "mannersList", dua: "duasList",
};
const KIND_SCREENS = {
  activity: "screen-activities", poem: "screen-poems", story: "screen-stories", manner: "screen-manners", dua: "screen-duas",
};
const contentByKind = { activity: [], poem: [], story: [], manner: [], dua: [] };
const contentIndex = {};

function reportKey(kind, id) { return kind + ":" + id; }

function renderCard(item) {
  const kind = item.kind;
  const locked = !item.isFree && !isPremiumUser();
  const report = reportsByKey[reportKey(kind, item.id)];
  const div = document.createElement("div");
  div.className = "content-card" + (locked ? " locked-card" : "");

  let metaLine = "";
  if (kind === "activity") {
    metaLine = esc(item.developmentArea || "");
  } else {
    const refLabel = { poem: "কবি", story: "লেখক" }[kind] || "রেফারেন্স";
    const refValue = item.author || item.reference || "";
    metaLine = refValue ? `${refLabel}: ${esc(refValue)}` : "";
  }

  let mainBtn;
  if (kind === "activity") {
    mainBtn = locked
      ? `<button class="btn-dim" data-locked-link="1">🔒 বিস্তারিত</button>`
      : `<button data-detail="activity" data-id="${item.id}">বিস্তারিত দেখুন</button>`;
  } else {
    mainBtn = locked
      ? `<button class="btn-dim" data-locked-link="1">🔒 পড়ুন</button>`
      : `<a href="${esc(item.wordpressLink || "#")}" target="_blank" rel="noopener">পড়ুন →</a>`;
  }
  const reportBtn = locked
    ? `<button class="btn-dim" data-locked-link="1">📝 রিপোর্ট 🔒</button>`
    : `<button data-report="${kind}:${item.id}">📝 ${report ? "রিপোর্ট আপডেট" : "রিপোর্ট দিন"}</button>`;
  const unlockBtn = locked ? `<button class="btn-unlock" data-go="screen-premium">🔓 আনলক</button>` : "";

  let chip = "";
  if (report && !locked) {
    const info = statusInfo(kind, report.status);
    chip = `<div class="status-chip">✅ ${esc(info ? info.label : "")} · ${fmtDateTime(report.updatedAt)}</div>`;
  }

  div.innerHTML = `
    <span class="badge ${locked ? "locked" : "free"}">${locked ? "প্রিমিয়াম" : "ফ্রি"}</span>
    <h3>${esc(item.title)}</h3>
    <div class="meta">${metaLine}</div>
    ${chip}
    <div class="actions">${mainBtn}${reportBtn}${unlockBtn}</div>
  `;
  return div;
}

function renderList(kind) {
  const listEl = document.getElementById(LIST_IDS[kind]);
  if (!listEl) return;
  listEl.innerHTML = "";
  const items = sortContent(contentByKind[kind]);
  if (!items.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="e">🗂️</div>এখনো কোনো কনটেন্ট যুক্ত হয়নি</div>`;
    return;
  }
  items.forEach(item => listEl.appendChild(renderCard(item)));
}

function renderAllContent() {
  KIND_ORDER.forEach(renderList);
}

KIND_ORDER.forEach(kind => {
  onSnapshot(collection(db, KIND_COLLECTIONS[kind]), (snap) => {
    contentByKind[kind] = snap.docs.map(d => {
      const item = { id: d.id, kind, ...d.data() };
      contentIndex[d.id] = item;
      return item;
    });
    renderList(kind);
    renderProgressSummary();
  }, (err) => console.error(kind, err));
});

// লক করা কনটেন্টে ক্লিক করলে
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-locked-link]")) {
    toast("এই কনটেন্টটি প্রিমিয়ামে আনলক করুন");
    showScreen("screen-premium");
  }
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-detail]");
  if (!btn) return;
  const item = contentIndex[btn.dataset.id];
  if (!item) return;
  if (!item.isFree && !isPremiumUser()) { toast("এই কনটেন্টটি প্রিমিয়ামে আনলক করুন"); showScreen("screen-premium"); return; }

  let html = `<h2 style="margin-bottom:10px;">${esc(item.title)}</h2>`;
  html += `<p><strong>ডেভেলপমেন্ট এরিয়া:</strong> ${esc(item.developmentArea || "-")}</p>`;
  html += `<div class="rules-box"><strong>খেলার নিয়ম</strong>${esc(item.rules || "-")}</div>`;
  if (item.imageDriveLink) html += `<p><a href="${esc(item.imageDriveLink)}" target="_blank" rel="noopener">📷 ছবি দেখুন</a></p>`;
  if (item.videoYoutubeLink) html += `<p><a href="${esc(item.videoYoutubeLink)}" target="_blank" rel="noopener">🎬 ভিডিও দেখুন</a></p>`;
  html += `<button class="btn-primary" id="btnGoToolsFromActivity" data-activity-id="${item.id}" style="margin-top:10px;">এই খেলার টুলস কিনুন</button>`;
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

/* ---------------------------------------------------------
   প্রতিটি কনটেন্টের রিপোর্ট ইনপুট (মোডাল)
--------------------------------------------------------- */
let activeReport = null; // { kind, id }

function openReportModal(kind, id) {
  const item = contentIndex[id];
  if (!item) return;
  if (!currentChildId) { toast("শিশুর তথ্য লোড হচ্ছে, একটু পরে আবার চেষ্টা করুন"); return; }
  activeReport = { kind, id };
  const existing = reportsByKey[reportKey(kind, id)];
  document.getElementById("reportModalTitle").textContent = `${KIND_LABELS[kind]}: ${item.title}`;
  document.getElementById("reportOptions").innerHTML = REPORT_STATUSES[kind].map(s => `
    <label class="report-option">
      <input type="radio" name="reportStatus" value="${s.key}" ${existing && existing.status === s.key ? "checked" : ""}>
      <span>${esc(s.label)}</span>
    </label>`).join("");
  document.getElementById("reportNote").value = (existing && existing.note) || "";
  const hist = ((existing && existing.history) || []).slice().sort((a, b) => b.at - a.at);
  document.getElementById("reportHistory").innerHTML = hist.length
    ? `<div class="hist-title">আগের রিপোর্টসমূহ</div>` + hist.map(h => {
        const info = statusInfo(kind, h.status);
        return `<div class="hist-row">${fmtDateTime(h.at)} — ${esc(info ? info.label : h.status)}${h.note ? " · " + esc(h.note) : ""}</div>`;
      }).join("")
    : "";
  document.getElementById("reportModal").classList.add("active");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-report]");
  if (!btn) return;
  const [kind, id] = btn.dataset.report.split(":");
  openReportModal(kind, id);
});
document.getElementById("closeReportModal").addEventListener("click", () => document.getElementById("reportModal").classList.remove("active"));

document.getElementById("btnSaveReport").addEventListener("click", async () => {
  if (!activeReport || !currentChildId) return;
  const picked = document.querySelector('input[name="reportStatus"]:checked');
  if (!picked) { toast("একটি অবস্থা বেছে নিন"); return; }
  const { kind, id } = activeReport;
  const item = contentIndex[id];
  const info = statusInfo(kind, picked.value);
  const note = document.getElementById("reportNote").value.trim();
  try {
    await setDoc(doc(db, "contentReports", `${currentChildId}_${kind}_${id}`), {
      guardianUid: currentGuardianUid,
      childId: currentChildId,
      kind,
      contentId: id,
      contentTitle: item ? item.title : "",
      status: picked.value,
      score: info ? info.score : 0,
      note,
      updatedAt: serverTimestamp(),
      history: arrayUnion({ status: picked.value, note, at: Date.now() }),
    }, { merge: true });
    document.getElementById("reportModal").classList.remove("active");
    toast("রিপোর্ট সংরক্ষিত হয়েছে");
  } catch (err) {
    toast("রিপোর্ট সংরক্ষণ করা যায়নি: " + err.message);
  }
});

function watchMyReports() {
  const q = query(collection(db, "contentReports"), where("guardianUid", "==", currentGuardianUid));
  onSnapshot(q, (snap) => {
    reportsByKey = {};
    snap.forEach(d => {
      const r = d.data();
      reportsByKey[reportKey(r.kind, r.contentId)] = r;
    });
    renderAllContent();
    renderProgressSummary();
  }, (err) => console.error("reports", err));
}

/* Poem / story / manner / dua common rules + know-kids content (single docs under siteContent) */
onSnapshot(doc(db, "siteContent", "rules"), (snap) => {
  const d = snap.data() || {};
  document.getElementById("poemRulesText").textContent = d.poemRules || "এখনো নিয়ম যুক্ত করা হয়নি";
  document.getElementById("storyRulesText").textContent = d.storyRules || "এখনো নিয়ম যুক্ত করা হয়নি";
  document.getElementById("mannerRulesText").textContent = d.mannerRules || "এখনো নিয়ম যুক্ত করা হয়নি";
  document.getElementById("duaRulesText").textContent = d.duaRules || "এখনো নিয়ম যুক্ত করা হয়নি";
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
    whatsapp: normalizeWhatsapp(document.getElementById("orderWhatsapp").value.trim()),
    status: "pending",
    createdAt: serverTimestamp(),
  });
  document.getElementById("orderModal").classList.remove("active");
  toast("অর্ডার পাঠানো হয়েছে, এডমিন কনফার্ম করবেন");
});

/* ---------------------------------------------------------
   শিশুর অগ্রগতি রিপোর্ট — ক্যাটাগরিভিত্তিক সারাংশ
--------------------------------------------------------- */
function loadMyChild() {
  if (!currentGuardianUid) return;
  const q = query(collection(db, "children"), where("guardianUid", "==", currentGuardianUid));
  onSnapshot(q, (snap) => {
    if (snap.empty) return;
    const d = snap.docs[0];
    currentChildId = d.id;
    currentChildData = d.data();
    renderProgressSummary();
  }, (err) => console.error("children", err));
}

function renderProgressSummary() {
  const container = document.getElementById("progressCategories");
  if (!container) return;
  if (!currentGuardianUid) { container.innerHTML = ""; return; }

  const premium = isPremiumUser();
  let allSum = 0, allTotal = 0, allReported = 0;
  const cards = KIND_ORDER.map(kind => {
    const items = contentByKind[kind];
    const s = categorySummary(kind, items, id => reportsByKey[reportKey(kind, id)], premium);
    allSum += s.sum; allTotal += s.total; allReported += s.reported;

    const chips = REPORT_STATUSES[kind]
      .filter(st => s.counts[st.key])
      .map(st => `<span class="chip">${esc(st.label)}: <b>${s.counts[st.key]}</b></span>`).join("");

    const rows = sortContent(items.filter(i => i.isFree || premium)).map(i => {
      const r = reportsByKey[reportKey(kind, i.id)];
      const info = r ? statusInfo(kind, r.status) : null;
      return `<div class="drow">
        <div class="dtitle">${esc(i.title)}</div>
        <div class="dstat">${r ? `${esc(info ? info.label : r.status)}<br><small>${fmtDateTime(r.updatedAt)}${r.note ? " · " + esc(r.note) : ""}</small>` : `<small>— এখনো রিপোর্ট দেওয়া হয়নি</small>`}</div>
      </div>`;
    }).join("");

    return `
      <div class="progress-card">
        <div class="prow-head"><span class="ptitle">${KIND_LABELS[kind]}</span><span class="pval">${s.pct}%</span></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${s.pct}%"></div></div>
        <div class="psub">রিপোর্ট দেওয়া হয়েছে: <b>${s.reported}</b>/${s.total} টি${s.last ? " · সর্বশেষ: " + fmtDateTime(s.last) : ""}</div>
        ${chips ? `<div class="chips">${chips}</div>` : ""}
        ${s.lockedCount ? `<div class="psub">🔒 আরও ${s.lockedCount} টি প্রিমিয়াম কনটেন্ট আছে — <a href="#" data-go="screen-premium">আনলক করুন</a></div>` : ""}
        ${rows ? `<details><summary>কনটেন্ট অনুযায়ী বিস্তারিত</summary>${rows}</details>` : ""}
        <button class="btn-secondary small" data-go="${KIND_SCREENS[kind]}">${KIND_LABELS[kind]}-এর কনটেন্টে যান (রিপোর্ট দিন)</button>
      </div>`;
  });

  const overall = allTotal ? Math.round(allSum / allTotal) : 0;
  const childName = currentChildData ? esc(currentChildData.name) : "";
  container.innerHTML = `
    <div class="progress-card overall">
      <div class="prow-head"><span class="ptitle">${childName ? childName + " — " : ""}সার্বিক অগ্রগতি</span><span class="pval">${overall}%</span></div>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${overall}%"></div></div>
      <div class="psub">মোট ${allTotal} টি কনটেন্টের মধ্যে <b>${allReported}</b> টির রিপোর্ট দেওয়া হয়েছে</div>
    </div>` + cards.join("");
}

/* ---------------------------------------------------------
   PAYMENT REQUESTS
--------------------------------------------------------- */
const PAY_METHOD_LABELS = { bkash: "বিকাশ", nagad: "নগদ", rocket: "রকেট", bank: "ব্যাংক" };

document.getElementById("btnSubmitPayment").addEventListener("click", async () => {
  const trxId = document.getElementById("payTrxId").value.trim();
  const senderNumber = document.getElementById("payFromNumber").value.trim().replace(/\s/g, "");
  if (!trxId) { toast("ট্রানজেকশন আইডি দিন"); return; }
  if (!senderNumber) { toast("যে নাম্বার থেকে পেমেন্ট করেছেন সেটি দিন"); return; }
  try {
    await addDoc(collection(db, "paymentRequests"), {
      guardianUid: currentGuardianUid,
      method: document.getElementById("payMethod").value,
      transactionId: trxId,
      senderNumber,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    document.getElementById("payTrxId").value = "";
    document.getElementById("payFromNumber").value = "";
    toast("রিকুয়েস্ট পাঠানো হয়েছে, এডমিন যাচাই করবেন");
  } catch (err) {
    toast("রিকুয়েস্ট পাঠানো যায়নি: " + err.message);
  }
});

function watchPaymentRequests() {
  if (!currentGuardianUid) return;
  const q = query(collection(db, "paymentRequests"), where("guardianUid", "==", currentGuardianUid));
  onSnapshot(q, (snap) => {
    const el = document.getElementById("paymentHistory");
    el.innerHTML = "<h3 style='margin-bottom:10px;'>আপনার রিকুয়েস্টসমূহ</h3>";
    const rows = snap.docs.map(d => d.data())
      .sort((a, b) => (toMillis(b.createdAt) || Date.now()) - (toMillis(a.createdAt) || Date.now()));
    rows.forEach(r => {
      const pillClass = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
      const pillTxt = r.status === "approved" ? "অ্যাপ্রুভড" : r.status === "rejected" ? "বাতিল" : "অপেক্ষমান";
      el.innerHTML += `<div class="content-card">
        <div class="meta">${PAY_METHOD_LABELS[r.method] || esc(r.method)} · ট্রানজেকশন: ${esc(r.transactionId)}<br>পেমেন্টের নাম্বার: ${esc(r.senderNumber || "—")}</div>
        <span class="pill ${pillClass}">${pillTxt}</span></div>`;
    });
  }, (err) => console.error("payments", err));
}

/* ---------------------------------------------------------
   MY ORDERS + RECEIPT (image / PDF / share)
--------------------------------------------------------- */
window.__myOrdersCache = window.__myOrdersCache || {};

function watchMyOrders() {
  if (!currentGuardianUid) return;
  const q = query(collection(db, "orders"), where("guardianUid", "==", currentGuardianUid));
  onSnapshot(q, (snap) => {
    const listEl = document.getElementById("myOrdersList");
    listEl.innerHTML = "";
    if (snap.empty) { listEl.innerHTML = `<div class="empty-state"><div class="e">📦</div>এখনো কোনো অর্ডার নেই</div>`; return; }
    [...snap.docs].sort((a, b) => (toMillis(b.data().createdAt) || Date.now()) - (toMillis(a.data().createdAt) || Date.now())).forEach(docSnap => {
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
