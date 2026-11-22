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
  statusInfo, toMillis, fmtDateTime, esc, sortContent, categorySummary,
  PREMIUM_PLANS, planInfo, effectivePremium, premiumState, fmtDate, daysLeft, safeUrl
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
  const notice = document.getElementById("resetNotice");
  if (!email) { toast("প্রথমে ইমেইল ঘরে আপনার ইমেইল লিখুন"); return; }
  notice.style.display = "block";
  notice.innerHTML = "রিসেট লিংক পাঠানো হচ্ছে...";
  try {
    await sendPasswordResetEmail(auth, email);
    notice.innerHTML = `✅ রিসেট লিংক <b>${esc(email)}</b>-এ পাঠানো হয়েছে।<br>
      📌 ইনবক্সে না পেলে <b>Spam / Junk / Promotions</b> ফোল্ডারও দেখুন — অনেক সময় লিংকটি সেখানেই চলে যায়। ২-৫ মিনিট অপেক্ষা করুন।
      সেখানে পেলে "Not spam" দিয়ে ইনবক্সে সরিয়ে নিন।`;
  } catch (err) {
    notice.innerHTML = "❌ পাঠানো যায়নি: " + esc(err.code === "auth/user-not-found" ? "এই ইমেইলে কোনো একাউন্ট নেই" : err.message);
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
   ইন্সটল সহায়তা (পাবলিক প্রচারের জন্য): নিরাপদ ইন্সটল বাটন + ফেসবুক/মেসেঞ্জারের ভেতরের ব্রাউজারের সতর্কতা
--------------------------------------------------------- */
let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isInAppBrowser() {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|MicroMessenger|Snapchat/i.test(navigator.userAgent);
}
function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function installDismissed() {
  try { return localStorage.getItem("kdcInstallDismissed") === "1"; } catch (e) { return false; }
}

function renderInstallHelp() {
  const targets = ["installHelpLogin", "installHelpDash"].map(id => document.getElementById(id)).filter(Boolean);
  let html = "";
  if (isStandalone()) {
    html = "";
  } else if (isInAppBrowser()) {
    html = `<div class="notice-box">
      ⚠️ আপনি এখন ফেসবুক/মেসেঞ্জারের ভেতরের ব্রাউজারে আছেন — এখান থেকে অ্যাপ ইন্সটল হয় না এবং কিছু সুবিধা কাজ না-ও করতে পারে।<br>
      <b>সমাধান:</b> উপরের ডান কোণের <b>⋮ (তিন ডট)</b> মেনু চাপুন → <b>"Open in Chrome" / "ব্রাউজারে খুলুন"</b> বেছে নিন।
    </div>`;
  } else if (deferredInstallPrompt && !installDismissed()) {
    html = `<div class="install-card">
      <div>
        <strong>📲 অ্যাপটি ফোনে ইন্সটল করুন</strong>
        <span>এটি সম্পূর্ণ নিরাপদ — কোনো APK ফাইল ডাউনলোড লাগে না, সরাসরি ব্রাউজার থেকেই ইন্সটল হয়।</span>
      </div>
      <button type="button" class="btn-install" data-install="1">ইন্সটল</button>
      <button type="button" class="btn-install-x" data-install-dismiss="1" aria-label="বন্ধ করুন">✕</button>
    </div>`;
  } else if (isIOS() && !installDismissed()) {
    html = `<div class="install-card">
      <div>
        <strong>📲 আইফোনে ইন্সটল করতে</strong>
        <span>Safari-র নিচের <b>Share (⬆️)</b> বাটন চাপুন → <b>"Add to Home Screen"</b> বেছে নিন। এটি নিরাপদ, কোনো ফাইল ডাউনলোড হয় না।</span>
      </div>
      <button type="button" class="btn-install-x" data-install-dismiss="1" aria-label="বন্ধ করুন">✕</button>
    </div>`;
  }
  targets.forEach(el => { el.innerHTML = html; });
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallHelp();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  renderInstallHelp();
  toast("অ্যাপ ইন্সটল হয়েছে ✅");
});
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-install]") && deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (err) {}
    deferredInstallPrompt = null;
    renderInstallHelp();
  }
  if (e.target.closest("[data-install-dismiss]")) {
    try { localStorage.setItem("kdcInstallDismissed", "1"); } catch (err) {}
    renderInstallHelp();
  }
});
renderInstallHelp();

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
  return effectivePremium(currentGuardianData); // মেয়াদ শেষ হলে স্বয়ংক্রিয়ভাবে false
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
  updatePremiumUI();
  renderPremiumScreen();
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

function updatePremiumUI() {
  const state = premiumState(currentGuardianData);
  const g = currentGuardianData || {};
  const btn = document.getElementById("btnGoPremium");
  if (state === "active") {
    document.getElementById("premiumTitle").textContent = "প্রিমিয়াম সদস্য ✨";
    document.getElementById("premiumSub").textContent = g.premiumUntil
      ? "সব কনটেন্ট আনলক — মেয়াদ " + fmtDate(g.premiumUntil) + " পর্যন্ত"
      : "সব কনটেন্ট আনলক — আজীবন";
    btn.style.display = "none";
  } else if (state === "expired") {
    document.getElementById("premiumTitle").textContent = "প্রিমিয়ামের মেয়াদ শেষ হয়েছে";
    document.getElementById("premiumSub").textContent = "সব কনটেন্ট আবার আনলক করতে রিনিউ করুন";
    btn.textContent = "রিনিউ করুন";
    btn.style.display = "block";
  } else {
    document.getElementById("premiumTitle").textContent = "ফ্রি ভার্সন ব্যবহার করছেন";
    document.getElementById("premiumSub").textContent = "সব কনটেন্ট আনলক করতে প্রিমিয়ামে যান";
    btn.textContent = "প্রিমিয়াম নিন";
    btn.style.display = "block";
  }
}

// অ্যাপ খোলা থাকা অবস্থায় মেয়াদ শেষ হলেও নিজে থেকে লক হয়ে যাবে
let lastPremiumEffective = null;
setInterval(() => {
  if (!currentGuardianData) return;
  const now = isPremiumUser();
  if (lastPremiumEffective !== null && now !== lastPremiumEffective) {
    refreshGuardianUI();
    renderAllContent();
    renderProgressSummary();
    if (!now) toast("আপনার প্রিমিয়ামের মেয়াদ শেষ হয়েছে");
  }
  lastPremiumEffective = now;
}, 30000);
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
  // ট্যাগ কনটেন্টের নিজের ধরন দেখায় (ফ্রি/প্রিমিয়াম); লক-আনলক আলাদা বিষয় — প্রিমিয়াম সদস্যের জন্য প্রিমিয়াম কনটেন্টও "প্রিমিয়াম" লেখাই থাকে
  const badgeClass = item.isFree ? "free" : (locked ? "locked" : "premium");
  const badgeText = item.isFree ? "ফ্রি" : (locked ? "🔒 প্রিমিয়াম" : "প্রিমিয়াম");

  let metaLine = "";
  if (kind === "activity") {
    const goal = item.goalOutput || item.developmentArea || "";
    metaLine = goal ? `লক্ষ্য ও আউটপুট: ${esc(goal)}` : "";
  } else {
    const refLabel = { poem: "কবি", story: "লেখক" }[kind] || "রেফারেন্স";
    const refValue = item.author || item.reference || "";
    metaLine = refValue ? `${refLabel}: ${esc(refValue)}` : "";
  }

  const mainBtn = locked
    ? `<button class="btn-dim" data-locked-link="1">🔒 পড়ুন</button>`
    : `<button data-open="${kind}:${item.id}">পড়ুন →</button>`;
  // এক্টিভিটির সাথে টুলস লিংক করা থাকলে সরাসরি কেনার বাটন
  const linkedTool = kind === "activity" && !locked
    ? Object.values(window.__toolsCache || {}).find(t => t.linkedActivityId === item.id)
    : null;
  const toolBtn = linkedTool ? `<button data-buy-tool="${item.id}">🧸 টুলস কিনুন</button>` : "";
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
    <span class="badge ${badgeClass}">${badgeText}</span>
    <h3>${esc(item.title)}</h3>
    <div class="meta">${metaLine}</div>
    ${chip}
    <div class="actions">${mainBtn}${reportBtn}${toolBtn}${unlockBtn}</div>
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

// প্রিমিয়াম কনটেন্টের সুরক্ষিত অংশ (লিংক/নিয়ম) আলাদা কালেকশন থেকে দরকারের সময় আনা হয় —
// ফায়ারস্টোর রুলস নিশ্চিত করে শুধু ফ্রি কনটেন্ট বা প্রিমিয়াম সদস্যই এগুলো পড়তে পারবে
const secretCache = {};
async function getSecret(id) {
  if (secretCache[id]) return secretCache[id];
  const snap = await getDoc(doc(db, "contentSecrets", id));
  let data;
  if (snap.exists()) data = snap.data();
  else {
    // এডমিন এখনো পুরনো কনটেন্ট সরায়নি হলে আগের ফিল্ড থেকে পড়া হয়
    const it = contentIndex[id] || {};
    data = { wordpressLink: it.wordpressLink };
  }
  secretCache[id] = data;
  return data;
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-open]");
  if (!btn) return;
  const id = btn.dataset.open.split(":")[1];
  const item = contentIndex[id];
  if (!item) return;
  if (!item.isFree && !isPremiumUser()) { toast("এই কনটেন্টটি প্রিমিয়ামে আনলক করুন"); showScreen("screen-premium"); return; }
  const w = window.open("", "_blank"); // ক্লিকের সাথে সাথে খুলে রাখা হয়, যাতে মোবাইলে পপআপ ব্লক না হয়
  try {
    const s = await getSecret(id);
    const url = safeUrl(s.wordpressLink);
    if (!url) { if (w) w.close(); toast("এই কনটেন্টের লিংক এখনো যুক্ত করা হয়নি"); return; }
    if (w) { w.opener = null; w.location.href = url; } else { window.location.href = url; }
  } catch (err) {
    if (w) w.close();
    toast(err.code === "permission-denied" ? "এই কনটেন্টটি প্রিমিয়ামে আনলক করুন" : "লিংক আনা যায়নি, আবার চেষ্টা করুন");
  }
});

document.getElementById("closeDetailModal").addEventListener("click", () => document.getElementById("detailModal").classList.remove("active"));

// এক্টিভিটির লিংকড টুলস কেনার ফর্ম খোলা
document.addEventListener("click", (e) => {
  const buy = e.target.closest("[data-buy-tool]");
  if (!buy) return;
  const linkedTool = Object.values(window.__toolsCache || {}).find(t => t.linkedActivityId === buy.dataset.buyTool);
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
  linkEl.href = safeUrl(d.wordpressLink) || "#";
});

/* ---------------------------------------------------------
   TOOLS + ORDERS
--------------------------------------------------------- */
let activeOrderTool = null;
onSnapshot(query(collection(db, "tools"), orderBy("createdAt", "desc")), (snap) => {
  const listEl = document.getElementById("toolsList");
  listEl.innerHTML = "";
  window.__toolsCache = {};
  if (snap.empty) {
    listEl.innerHTML = `<div class="empty-state"><div class="e">🧸</div>এখনো কোনো টুলস যুক্ত হয়নি</div>`;
    renderList("activity");
    return;
  }
  snap.forEach(docSnap => {
    const t = { id: docSnap.id, ...docSnap.data() };
    window.__toolsCache[t.id] = t;
    const div = document.createElement("div");
    div.className = "content-card";
    div.innerHTML = `
      <h3>${esc(t.name)}</h3>
      <div class="meta">মূল্য: ৳${esc(t.price || "-")} ${t.materials ? "· উপকরণ: " + esc(t.materials) : ""}</div>
      <div class="actions">
        <button data-tool-detail="${t.id}">বিস্তারিত</button>
        <button data-order="${t.id}">কিনুন</button>
      </div>`;
    listEl.appendChild(div);
  });
  renderList("activity"); // লিংকড টুলস থাকলে এক্টিভিটি কার্ডে "টুলস কিনুন" বাটন আসবে
});
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-tool-detail]");
  if (d) {
    const t = window.__toolsCache[d.dataset.toolDetail];
    document.getElementById("detailModalBody").innerHTML = `
      <h2>${esc(t.name)}</h2>
      <p><strong>মূল্য:</strong> ৳${esc(t.price || "-")}</p>
      <p><strong>আইটেম:</strong> ${esc(t.itemsDetails || "-")}</p>
      <p><strong>তৈরির উপকরণ:</strong> ${esc(t.materials || "-")}</p>`;
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
   প্রিমিয়াম প্ল্যান ও PAYMENT REQUESTS
--------------------------------------------------------- */
const PAY_METHOD_LABELS = { bkash: "বিকাশ", nagad: "নগদ", rocket: "রকেট", bank: "ব্যাংক" };
let payMethods = [];   // এডমিনের যোগ করা পেমেন্ট মাধ্যম ও নাম্বার
let planPrices = {};   // এডমিন নির্ধারিত ফি: { y1, y2, y3, lifetime }
let myRequests = [];
let selectedPlan = null;

onSnapshot(doc(db, "siteContent", "premiumPlans"), (snap) => {
  planPrices = snap.exists() ? snap.data() : {};
  renderPremiumScreen();
}, (err) => console.error("plans", err));

onSnapshot(collection(db, "paymentMethods"), (snap) => {
  payMethods = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((x, y) => (toMillis(x.createdAt) || Number.MAX_SAFE_INTEGER) - (toMillis(y.createdAt) || Number.MAX_SAFE_INTEGER));
  renderPayMethodOptions();
}, (err) => console.error("paymentMethods", err));

function parseTxTypes(m) {
  return String((m && m.txTypes) || "").split(/[,،]/).map(s => s.trim()).filter(Boolean);
}

function renderPayMethodOptions() {
  const sel = document.getElementById("payMethod");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = payMethods.length
    ? payMethods.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")
    : `<option value="">পেমেন্ট নাম্বার এখনো যুক্ত হয়নি</option>`;
  if (payMethods.some(m => m.id === prev)) sel.value = prev;
  renderPayMethodInfo();
}

function renderPayMethodInfo() {
  const sel = document.getElementById("payMethod");
  const info = document.getElementById("payMethodInfo");
  const txField = document.getElementById("payTxTypeField");
  const txSel = document.getElementById("payTxType");
  if (!sel || !info) return;
  const m = payMethods.find(x => x.id === sel.value);
  if (!m) {
    info.innerHTML = payMethods.length ? "" : `<div class="notice-box">পেমেন্টের নাম্বার এখনো যুক্ত করা হয়নি। একটু পরে আবার চেষ্টা করুন।</div>`;
    txField.style.display = "none";
    txSel.innerHTML = "";
    return;
  }
  info.innerHTML = `<div class="pay-info">
    <div class="pay-info-title">${esc(m.name)} — এই নাম্বারে/একাউন্টে পাঠান</div>
    <div class="pay-number">${esc(m.number)}</div>
    <button type="button" class="btn-copy" data-copy="${esc(m.number)}">📋 নাম্বার কপি করুন</button>
    ${m.holder ? `<div class="pay-line">একাউন্টের নাম: <b>${esc(m.holder)}</b></div>` : ""}
    ${m.note ? `<div class="pay-line">${esc(m.note)}</div>` : ""}
  </div>`;
  const types = parseTxTypes(m);
  if (types.length) {
    txField.style.display = "block";
    txSel.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  } else {
    txField.style.display = "none";
    txSel.innerHTML = "";
  }
}
document.getElementById("payMethod").addEventListener("change", renderPayMethodInfo);

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const text = btn.dataset.copy;
  try {
    await navigator.clipboard.writeText(text);
    toast("নাম্বার কপি হয়েছে");
  } catch (err) {
    toast("কপি করা যায়নি — নাম্বারটি চেপে ধরে কপি করুন");
  }
});

function currentCycle() {
  return (currentGuardianData && currentGuardianData.premiumCycle) || 0;
}

function renderPremiumScreen() {
  const statusBox = document.getElementById("premiumStatusBox");
  const form = document.getElementById("premiumRequestForm");
  if (!statusBox || !form || !currentGuardianData) return;
  const g = currentGuardianData;
  const state = premiumState(g);

  if (state === "active") {
    const plan = planInfo(g.premiumPlan);
    const label = plan ? plan.label : "আজীবন";
    const detail = g.premiumUntil
      ? `${label} · শেষ হবে ${fmtDate(g.premiumUntil)} (আর ${daysLeft(g.premiumUntil)} দিন)`
      : label;
    statusBox.innerHTML = `<div class="premium-status"><strong>✨ প্রিমিয়াম চালু আছে</strong><span>মেয়াদ: ${esc(detail)}</span></div>`;
    form.style.display = "none";
    return;
  }

  statusBox.innerHTML = state === "expired"
    ? `<div class="premium-status expired"><strong>প্রিমিয়ামের মেয়াদ শেষ হয়েছে</strong><span>${esc(fmtDate(g.premiumUntil))}-এ শেষ হয়েছে। নতুন করে রিকুয়েস্ট করুন।</span></div>`
    : "";
  form.style.display = "block";
  renderPlanOptions();
}

function renderPlanOptions() {
  const el = document.getElementById("planOptions");
  const cycle = currentCycle();
  const cycleRequests = myRequests.filter(r => r.plan && (r.cycle || 0) === cycle);
  el.innerHTML = PREMIUM_PLANS.map(p => {
    const price = Number(planPrices[p.key]);
    const hasPrice = price > 0;
    const req = cycleRequests.find(r => r.plan === p.key);
    const blocked = !!req && req.status !== "rejected";
    const disabled = !hasPrice || blocked;
    let tag = "";
    if (!hasPrice) tag = "ফি এখনো নির্ধারিত হয়নি";
    else if (blocked) tag = req.status === "approved" ? "অ্যাপ্রুভ হয়েছে" : "রিকুয়েস্ট পাঠানো হয়েছে — এডমিনের যাচাইয়ের অপেক্ষায়";
    else if (req) tag = "আগের রিকুয়েস্ট বাতিল হয়েছে — আবার পাঠাতে পারেন";
    const checked = selectedPlan === p.key && !disabled;
    return `<label class="plan-option ${disabled ? "disabled" : ""}">
      <input type="radio" name="planChoice" value="${p.key}" ${disabled ? "disabled" : ""} ${checked ? "checked" : ""}>
      <span class="plan-name">${p.label}${tag ? `<span class="plan-tag">${tag}</span>` : ""}</span>
      <span class="plan-price">${hasPrice ? "৳ " + price : ""}</span>
    </label>`;
  }).join("");
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.name === "planChoice") selectedPlan = e.target.value;
});

document.getElementById("btnSubmitPayment").addEventListener("click", async () => {
  if (!currentGuardianUid) return;
  if (premiumState(currentGuardianData) === "active") { toast("আপনার প্রিমিয়াম এখনো চালু আছে"); return; }
  if (!selectedPlan) { toast("আগে মেয়াদ বেছে নিন"); return; }
  const price = Number(planPrices[selectedPlan]);
  if (!(price > 0)) { toast("এই মেয়াদের ফি এখনো নির্ধারিত হয়নি"); return; }
  const method = payMethods.find(x => x.id === document.getElementById("payMethod").value);
  if (!method) { toast("পেমেন্ট মাধ্যম বেছে নিন"); return; }
  const txTypes = parseTxTypes(method);
  const txType = txTypes.length ? document.getElementById("payTxType").value : "";
  if (txTypes.length && !txType) { toast("লেনদেনের ধরন বেছে নিন"); return; }
  const trxId = document.getElementById("payTrxId").value.trim();
  const senderNumber = document.getElementById("payFromNumber").value.trim().replace(/\s/g, "");
  if (!trxId) { toast("ট্রানজেকশন আইডি দিন"); return; }
  if (!senderNumber) { toast("যে নাম্বার থেকে পেমেন্ট করেছেন সেটি দিন"); return; }

  const cycle = currentCycle();
  const id = `${currentGuardianUid}_${selectedPlan}_${cycle}`;
  const existing = myRequests.find(r => r.id === id);
  if (existing && existing.status !== "rejected") { toast("এই মেয়াদের জন্য ইতিমধ্যে রিকুয়েস্ট করা হয়েছে"); return; }

  const plan = planInfo(selectedPlan);
  try {
    await setDoc(doc(db, "paymentRequests", id), {
      guardianUid: currentGuardianUid,
      plan: selectedPlan,
      planLabel: plan.label,
      amount: price,
      cycle,
      method: method.name,
      methodId: method.id,
      methodName: method.name,
      methodNumber: method.number,
      txType,
      transactionId: trxId,
      senderNumber,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    document.getElementById("payTrxId").value = "";
    document.getElementById("payFromNumber").value = "";
    selectedPlan = null;
    toast("রিকুয়েস্ট পাঠানো হয়েছে, এডমিন যাচাই করবেন");
  } catch (err) {
    toast(err.code === "permission-denied"
      ? "রিকুয়েস্ট পাঠানো যায়নি — এই মেয়াদে আগেই রিকুয়েস্ট করা হয়েছে অথবা প্রিমিয়াম এখনো চালু আছে"
      : "রিকুয়েস্ট পাঠানো যায়নি: " + err.message);
  }
});

function renderPaymentHistory() {
  const el = document.getElementById("paymentHistory");
  el.innerHTML = "<h3 style='margin-bottom:10px;'>আপনার রিকুয়েস্টসমূহ</h3>";
  myRequests.forEach(r => {
    const pillClass = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
    const pillTxt = r.status === "approved" ? "অ্যাপ্রুভড" : r.status === "rejected" ? "বাতিল" : "অপেক্ষমান";
    el.innerHTML += `<div class="content-card">
      <h3 style="font-size:14.5px;">${esc(r.planLabel || "প্রিমিয়াম")}${r.amount ? " — ৳ " + esc(r.amount) : ""}</h3>
      <div class="meta">${esc(r.methodName || PAY_METHOD_LABELS[r.method] || r.method)}${r.txType ? " (" + esc(r.txType) + ")" : ""}${r.methodNumber ? " → " + esc(r.methodNumber) : ""}<br>ট্রানজেকশন: ${esc(r.transactionId)} · যে নাম্বার থেকে: ${esc(r.senderNumber || "—")}<br>${fmtDateTime(r.createdAt)}</div>
      <span class="pill ${pillClass}">${pillTxt}</span></div>`;
  });
}

function watchPaymentRequests() {
  if (!currentGuardianUid) return;
  const q = query(collection(db, "paymentRequests"), where("guardianUid", "==", currentGuardianUid));
  onSnapshot(q, (snap) => {
    myRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toMillis(b.createdAt) || Date.now()) - (toMillis(a.createdAt) || Date.now()));
    renderPaymentHistory();
    renderPremiumScreen();
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
        <h3>${esc(o.toolName)}</h3>
        <div class="meta">পরিমাণ: ${esc(o.quantity)} · ৳${esc((Number(o.price)||0) * (Number(o.quantity)||1))}</div>
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
    <p><strong>আইটেম:</strong> ${esc(o.toolName)}</p>
    <p><strong>পরিমাণ:</strong> ${esc(o.quantity)}</p>
    <p><strong>মূল্য/একক:</strong> ৳${esc(o.price || "-")}</p>
    <p><strong>মোট:</strong> ৳${esc((Number(o.price) || 0) * (Number(o.quantity) || 1))}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:10px 0;">
    <p><strong>ঠিকানা:</strong> ${esc(o.address || "-")}</p>
    <p><strong>হোয়াটসএপ:</strong> ${esc(o.whatsapp || "-")}</p>
    <p><strong>স্ট্যাটাস:</strong> ${esc(o.status)}</p>
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
