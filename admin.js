// js/admin.js
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection,
  query, orderBy, onSnapshot, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  KIND_ORDER, KIND_LABELS, statusInfo, toMillis, fmtDateTime, esc, sortContent, categorySummary
} from "./shared.js";

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".admin-sidebar nav button").forEach(b => b.classList.toggle("active", b.dataset.go === id));
}
document.querySelectorAll(".admin-sidebar nav button").forEach(b => b.addEventListener("click", () => showScreen(b.dataset.go)));

/* ---------------- AUTH ---------------- */
document.getElementById("btnAdminLogin").addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const pw = document.getElementById("adminPassword").value;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pw);
    const adminDoc = await getDoc(doc(db, "admins", cred.user.uid));
    if (!adminDoc.exists()) {
      document.getElementById("adminLoginErr").textContent = "এই একাউন্টের এডমিন অনুমতি নেই";
      await signOut(auth);
      return;
    }
    enterAdmin();
  } catch (err) {
    document.getElementById("adminLoginErr").textContent = "লগইন ব্যর্থ: " + err.message;
  }
});
document.getElementById("btnAdminLogout").addEventListener("click", async () => { await signOut(auth); location.reload(); });

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    document.getElementById("admin-login").classList.add("active");
    document.getElementById("adminShell").classList.add("hidden");
    return;
  }
  const adminDoc = await getDoc(doc(db, "admins", user.uid));
  if (adminDoc.exists()) enterAdmin();
});

let adminStarted = false;
function enterAdmin() {
  startAdmin(); // লগইন যাচাইয়ের পরেই ডাটা লিসেনার চালু হয় (আগে চালালে permission-denied হতো)
  document.getElementById("admin-login").classList.remove("active");
  document.getElementById("adminShell").classList.remove("hidden");
  showScreen("a-overview");
}


function startAdmin() {
  if (adminStarted) return;
  adminStarted = true;


/* ---------------- কনটেন্ট ম্যানেজমেন্ট (যুক্ত / এডিট / মুছুন) ---------------- */
async function removeDoc(colName, id) {
  if (!confirm("মুছে ফেলতে চান?")) return;
  await deleteDoc(doc(db, colName, id));
}

const adminContent = { activity: [], poem: [], story: [], manner: [], dua: [] };

const CRUD = [
  { col: "activities", kind: "activity", btn: "btnAddActivity", table: "tblActivities",
    fields: { title: "actTitle", developmentArea: "actDevArea", rules: "actRules", imageDriveLink: "actImage", videoYoutubeLink: "actVideo", isFree: "actFree" },
    cells: ["title", "developmentArea"] },
  { col: "poems", kind: "poem", btn: "btnAddPoem", table: "tblPoems",
    fields: { title: "poemTitle", author: "poemPoet", wordpressLink: "poemLink", isFree: "poemFree" },
    cells: ["title", "author"] },
  { col: "stories", kind: "story", btn: "btnAddStory", table: "tblStories",
    fields: { title: "storyTitle", author: "storyAuthor", wordpressLink: "storyLink", isFree: "storyFree" },
    cells: ["title", "author"] },
  { col: "manners", kind: "manner", btn: "btnAddManner", table: "tblManners",
    fields: { title: "mannerTitle", author: "mannerAuthor", wordpressLink: "mannerLink", isFree: "mannerFree" },
    cells: ["title", "author"] },
  { col: "duas", kind: "dua", btn: "btnAddDua", table: "tblDuas",
    fields: { title: "duaTitle", author: "duaAuthor", wordpressLink: "duaLink", isFree: "duaFree" },
    cells: ["title", "author"] },
  { col: "tools", kind: null, btn: "btnAddTool", table: "tblTools",
    fields: { name: "toolName", price: "toolPrice", itemsDetails: "toolItems", materials: "toolMaterials", linkedActivityId: "toolLinkedActivity" },
    numbers: ["price"], cells: ["name", "price"] },
];

function readValues(cfg) {
  const out = {};
  Object.entries(cfg.fields).forEach(([key, id]) => {
    let v = document.getElementById(id).value;
    if (key === "isFree") v = v === "true";
    else if (cfg.numbers && cfg.numbers.includes(key)) v = Number(v) || 0;
    else if (key === "linkedActivityId") v = v || null;
    else v = v.trim();
    out[key] = v;
  });
  return out;
}
function fillValues(cfg, item) {
  Object.entries(cfg.fields).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (key === "isFree") el.value = item.isFree ? "true" : "false";
    else el.value = item[key] == null ? "" : item[key];
  });
}
function clearValues(cfg) {
  Object.entries(cfg.fields).forEach(([key, id]) => {
    document.getElementById(id).value = key === "isFree" ? "false" : "";
  });
}
function enterEdit(cfg, id) {
  const item = cfg.cache[id];
  if (!item) return;
  fillValues(cfg, item);
  cfg.editingId = id;
  cfg.btnEl.textContent = "আপডেট করুন";
  cfg.cancelEl.style.display = "block";
  cfg.btnEl.scrollIntoView({ behavior: "smooth", block: "center" });
  toast("এডিট মোড — পরিবর্তন করে 'আপডেট করুন' চাপুন");
}
function exitEdit(cfg) {
  clearValues(cfg);
  cfg.editingId = null;
  cfg.btnEl.textContent = "যুক্ত করুন";
  cfg.cancelEl.style.display = "none";
}

CRUD.forEach(cfg => {
  cfg.cache = {};
  cfg.editingId = null;
  cfg.btnEl = document.getElementById(cfg.btn);
  cfg.cancelEl = document.createElement("button");
  cfg.cancelEl.type = "button";
  cfg.cancelEl.className = "btn-secondary";
  cfg.cancelEl.style.cssText = "display:none; margin-top:10px;";
  cfg.cancelEl.textContent = "এডিট বাতিল করুন";
  cfg.btnEl.insertAdjacentElement("afterend", cfg.cancelEl);
  cfg.cancelEl.addEventListener("click", () => exitEdit(cfg));

  cfg.btnEl.addEventListener("click", async () => {
    const data = readValues(cfg);
    const nameKey = cfg.fields.title ? "title" : "name";
    if (!data[nameKey]) { toast("শিরোনাম/নাম লিখুন"); return; }
    try {
      if (cfg.editingId) {
        await updateDoc(doc(db, cfg.col, cfg.editingId), { ...data, updatedAt: serverTimestamp() });
        toast("আপডেট হয়েছে");
      } else {
        await addDoc(collection(db, cfg.col), { ...data, createdAt: serverTimestamp() });
        toast("যুক্ত করা হয়েছে");
      }
      exitEdit(cfg);
    } catch (err) {
      toast("সমস্যা হয়েছে: " + err.message);
    }
  });

  onSnapshot(collection(db, cfg.col), (snap) => {
    cfg.cache = {};
    let items = snap.docs.map(d => { const it = { id: d.id, ...d.data() }; cfg.cache[d.id] = it; return it; });
    items = cfg.kind
      ? sortContent(items)
      : items.sort((a, b) => (toMillis(a.createdAt) || Number.MAX_SAFE_INTEGER) - (toMillis(b.createdAt) || Number.MAX_SAFE_INTEGER));

    const tb = document.querySelector(`#${cfg.table} tbody`);
    tb.innerHTML = items.map(it => {
      const cells = cfg.cells.map(k => `<td>${k === "price" ? "৳" + esc(it[k]) : esc(it[k] || "")}</td>`).join("");
      const freeCell = cfg.kind ? `<td>${it.isFree ? "ফ্রি" : "পেইড"}</td>` : "";
      return `<tr>${cells}${freeCell}<td style="white-space:nowrap;">
        <button class="tiny-btn ok" data-edit="${cfg.col}:${it.id}">এডিট</button>
        <button class="tiny-btn no" data-del="${cfg.col}:${it.id}">মুছুন</button></td></tr>`;
    }).join("");

    if (cfg.kind) {
      adminContent[cfg.kind] = items;
      renderChildrenProgressTable();
    }
    if (cfg.col === "activities") {
      const sel = document.getElementById("toolLinkedActivity");
      const prev = sel.value;
      sel.innerHTML = `<option value="">-- কোনোটার সাথে নয় --</option>` +
        items.map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join("");
      sel.value = prev;
    }
  });
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-edit]");
  if (!b) return;
  const [col, id] = b.dataset.edit.split(":");
  const cfg = CRUD.find(c => c.col === col);
  if (cfg) enterEdit(cfg, id);
});
/* ---------------- SITE RULES + KNOW KIDS ---------------- */
getDoc(doc(db, "siteContent", "rules")).then(s => {
  const d = s.data() || {};
  document.getElementById("ruleaPoem").value = d.poemRules || "";
  document.getElementById("ruleaStory").value = d.storyRules || "";
  document.getElementById("ruleaManner").value = d.mannerRules || "";
  document.getElementById("ruleaDua").value = d.duaRules || "";
});
document.getElementById("btnSaveRules").addEventListener("click", async () => {
  await setDoc(doc(db, "siteContent", "rules"), {
    poemRules: document.getElementById("ruleaPoem").value.trim(),
    storyRules: document.getElementById("ruleaStory").value.trim(),
    mannerRules: document.getElementById("ruleaManner").value.trim(),
    duaRules: document.getElementById("ruleaDua").value.trim(),
  });
  toast("নিয়মাবলী সেভ হয়েছে");
});
getDoc(doc(db, "siteContent", "knowKids")).then(s => {
  const d = s.data() || {};
  document.getElementById("kkMarquee").value = d.marqueeText || "";
  document.getElementById("kkTitle").value = d.wordpressTitle || "";
  document.getElementById("kkLink").value = d.wordpressLink || "";
});
document.getElementById("btnSaveKnowKids").addEventListener("click", async () => {
  await setDoc(doc(db, "siteContent", "knowKids"), {
    marqueeText: document.getElementById("kkMarquee").value.trim(),
    wordpressTitle: document.getElementById("kkTitle").value.trim(),
    wordpressLink: document.getElementById("kkLink").value.trim(),
  });
  toast("সেভ হয়েছে");
});

/* ---------------- ORDERS ---------------- */
window.__ordersCache = window.__ordersCache || {};
onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblOrders tbody"); tb.innerHTML = "";
  snap.forEach(d => {
    const o = d.data();
    window.__ordersCache[d.id] = { id: d.id, ...o };
    const pillClass = o.status === "confirmed" ? "approved" : o.status === "cancelled" ? "rejected" : "pending";
    tb.innerHTML += `<tr>
      <td>${o.toolName}</td><td>${o.quantity}</td><td>${o.address||""}</td><td>${o.whatsapp||""}</td>
      <td><span class="pill ${pillClass}">${o.status}</span></td>
      <td><button class="tiny-btn" style="background:#DFF3EA;color:#1F7E68;" data-receipt="${d.id}">রশিদ</button></td>
      <td>
        <button class="tiny-btn ok" data-order-status="${d.id}:confirmed">কনফার্ম</button>
        <button class="tiny-btn no" data-order-status="${d.id}:cancelled">বাতিল</button>
      </td></tr>`;
  });
});


/* ---------------- PAYMENT REQUESTS ---------------- */
const PAY_METHOD_LABELS = { bkash: "বিকাশ", nagad: "নগদ", rocket: "রকেট", bank: "ব্যাংক" };
let paymentsCache = [];

function renderPayments() {
  const tb = document.querySelector("#tblPayments tbody");
  tb.innerHTML = paymentsCache.map(r => {
    const g = window.__guardiansCache[r.guardianUid];
    const pillClass = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
    const pillTxt = r.status === "approved" ? "অ্যাপ্রুভড" : r.status === "rejected" ? "বাতিল" : "অপেক্ষমান";
    const actions = r.status === "pending"
      ? `<button class="tiny-btn ok" data-pay-approve="${r.id}:${r.guardianUid}">অ্যাপ্রুভ</button>
         <button class="tiny-btn no" data-pay-reject="${r.id}">বাতিল</button>`
      : "";
    return `<tr>
      <td>${PAY_METHOD_LABELS[r.method] || esc(r.method)}</td>
      <td>${esc(r.transactionId)}</td>
      <td>${esc(r.senderNumber || "—")}</td>
      <td>${g ? esc(g.guardianName) + "<br><small>" + esc(g.whatsapp || "") + "</small>" : "—"}</td>
      <td>${fmtDateTime(r.createdAt)}</td>
      <td><span class="pill ${pillClass}">${pillTxt}</span></td>
      <td style="white-space:nowrap;">${actions}</td></tr>`;
  }).join("");
}
window.__guardiansCache = window.__guardiansCache || {};
onSnapshot(collection(db, "paymentRequests"), (snap) => {
  paymentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toMillis(b.createdAt) || Date.now()) - (toMillis(a.createdAt) || Date.now()));
  renderPayments();
});

/* ---------------- গার্ডিয়ানস ---------------- */
onSnapshot(collection(db, "guardians"), (snap) => {
  const tb = document.querySelector("#tblGuardians tbody");
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toMillis(b.createdAt) || Date.now()) - (toMillis(a.createdAt) || Date.now()));
  window.__guardiansCache = {};
  list.forEach(g => { window.__guardiansCache[g.id] = g; });
  tb.innerHTML = list.map(g => `<tr>
      <td>${esc(g.guardianName)}</td><td>${esc(g.email)}</td><td>${esc(g.whatsapp)}</td>
      <td><span class="pill ${g.isPremium ? "approved" : "pending"}">${g.isPremium ? "প্রিমিয়াম" : "ফ্রি"}</span></td>
      <td><button class="tiny-btn ok" data-resend-reset="${esc(g.email)}">রিসেট ইমেইল পাঠান</button></td></tr>`).join("");
  renderPayments();
  renderChildrenProgressTable();
});

/* ---------------- শিশুর অগ্রগতি রিপোর্ট (সব শিশু, কনটেন্টভিত্তিক) ---------------- */
let childrenList = [];
let reportsByChild = {}; // childId -> { "kind:contentId": report }

function childSummaries(child) {
  const g = window.__guardiansCache[child.guardianUid];
  const premium = !!(g && g.isPremium);
  const reports = reportsByChild[child.id] || {};
  return KIND_ORDER.map(kind =>
    categorySummary(kind, adminContent[kind], id => reports[kind + ":" + id], premium));
}

function renderChildrenProgressTable() {
  const tb = document.querySelector("#tblChildren tbody");
  if (!tb) return;
  tb.innerHTML = childrenList.map(c => {
    const g = window.__guardiansCache[c.guardianUid];
    const sums = childSummaries(c);
    const cells = sums.map(s => `<td>${s.reported}/${s.total}<br><b>${s.pct}%</b></td>`).join("");
    return `<tr>
      <td>${esc(c.name)}<br><small>${esc(c.dob || "")}</small></td>
      <td>${g ? esc(g.guardianName) : "—"}<br><small>${g && g.isPremium ? "প্রিমিয়াম" : "ফ্রি"}</small></td>
      ${cells}
      <td><button class="tiny-btn ok" data-child-report="${c.id}">বিস্তারিত</button></td></tr>`;
  }).join("");
}

function openChildReport(childId) {
  const c = childrenList.find(x => x.id === childId);
  if (!c) return;
  const g = window.__guardiansCache[c.guardianUid];
  const premium = !!(g && g.isPremium);
  const reports = reportsByChild[childId] || {};
  let html = `<h2 style="margin-bottom:4px;">${esc(c.name)}</h2>
    <p style="font-size:13px; color:var(--ink-soft); margin:0 0 14px;">জন্ম তারিখ: ${esc(c.dob || "—")} · অভিভাবক: ${g ? esc(g.guardianName) : "—"} (${g ? esc(g.whatsapp || "") : ""}) · ${premium ? "প্রিমিয়াম" : "ফ্রি"}</p>`;
  KIND_ORDER.forEach(kind => {
    const items = sortContent(adminContent[kind]);
    const s = categorySummary(kind, adminContent[kind], id => reports[kind + ":" + id], premium);
    html += `<h3 style="margin:16px 0 4px;">${KIND_LABELS[kind]} — ${s.pct}% <small style="font-weight:400;">(${s.reported}/${s.total} টির রিপোর্ট)</small></h3>`;
    if (!items.length) { html += `<p style="font-size:13px; color:var(--ink-soft);">কোনো কনটেন্ট নেই</p>`; return; }
    html += items.map(i => {
      const r = reports[kind + ":" + i.id];
      const info = r ? statusInfo(kind, r.status) : null;
      const hist = r && r.history && r.history.length > 1 ? ` · ${r.history.length} বার আপডেট` : "";
      return `<div style="display:flex; justify-content:space-between; gap:10px; padding:7px 0; border-bottom:1px solid var(--sand-deep); font-size:13px;">
        <div>${esc(i.title)} ${i.isFree ? "" : "<small>(প্রিমিয়াম)</small>"}</div>
        <div style="text-align:right; color:var(--ink-soft);">${r ? esc(info ? info.label : r.status) + "<br><small>" + fmtDateTime(r.updatedAt) + hist + (r.note ? " · " + esc(r.note) : "") + "</small>" : "<small>—</small>"}</div>
      </div>`;
    }).join("");
  });
  document.getElementById("childReportBody").innerHTML = html;
  document.getElementById("childReportModal").classList.add("active");
}
document.getElementById("closeChildReportModal").addEventListener("click", () =>
  document.getElementById("childReportModal").classList.remove("active"));

onSnapshot(collection(db, "children"), (snap) => {
  childrenList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toMillis(a.createdAt) || Date.now()) - (toMillis(b.createdAt) || Date.now()));
  renderChildrenProgressTable();
});
onSnapshot(collection(db, "contentReports"), (snap) => {
  reportsByChild = {};
  snap.forEach(d => {
    const r = d.data();
    (reportsByChild[r.childId] = reportsByChild[r.childId] || {})[r.kind + ":" + r.contentId] = r;
  });
  renderChildrenProgressTable();
});
/* ---------------- DELEGATED CLICK HANDLERS ---------------- */
document.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    const [col, id] = del.dataset.del.split(":");
    await removeDoc(col, id);
  }
  const os = e.target.closest("[data-order-status]");
  if (os) {
    const [id, status] = os.dataset.orderStatus.split(":");
    await updateDoc(doc(db, "orders", id), { status });
    toast("স্ট্যাটাস আপডেট হয়েছে");
  }
  const approve = e.target.closest("[data-pay-approve]");
  if (approve) {
    const [id, guardianUid] = approve.dataset.payApprove.split(":");
    try {
      await updateDoc(doc(db, "guardians", guardianUid), { isPremium: true });
      await updateDoc(doc(db, "paymentRequests", id), { status: "approved", reviewedAt: serverTimestamp() });
      toast("প্রিমিয়াম আনলক করা হয়েছে");
    } catch (err) {
      toast("অ্যাপ্রুভ করা যায়নি: " + err.message);
    }
  }
  const reject = e.target.closest("[data-pay-reject]");
  if (reject) {
    await updateDoc(doc(db, "paymentRequests", reject.dataset.payReject), { status: "rejected", reviewedAt: serverTimestamp() });
    toast("বাতিল করা হয়েছে");
  }
  const childRep = e.target.closest("[data-child-report]");
  if (childRep) openChildReport(childRep.dataset.childReport);

  const receiptBtn = e.target.closest("[data-receipt]");
  if (receiptBtn) openReceipt(receiptBtn.dataset.receipt);

  const resend = e.target.closest("[data-resend-reset]");
  if (resend) {
    const email = resend.dataset.resendReset;
    if (!email) { toast("এই গার্ডিয়ানের ইমেইল পাওয়া যায়নি"); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      toast("রিসেট লিংক পাঠানো হয়েছে — গার্ডিয়ানকে Spam/Junk ফোল্ডার চেক করতে বলুন");
    } catch (err) {
      toast("পাঠাতে সমস্যা হয়েছে: " + err.message);
    }
  }
});

/* ---------------- RECEIPT (image / PDF / share) ---------------- */
function openReceipt(orderId) {
  const o = window.__ordersCache[orderId];
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
      } catch (e) { /* user cancelled or unsupported, fall through */ }
    }
    toast("এই ডিভাইসে সরাসরি শেয়ার সাপোর্ট নেই — ছবি ডাউনলোড করে হোয়াটসএপে সংযুক্ত করুন");
  }, "image/png");
});

/* ---------------- OVERVIEW COUNTS ---------------- */
function overviewCard(label, emoji) {
  return `<div class="feature-card"><div class="emoji">${emoji}</div><div><div class="title" id="ov-${label}">0</div><div class="sub">${label}</div></div></div>`;
}
document.getElementById("overviewGrid").innerHTML =
  overviewCard("শিশু", "🏅") + overviewCard("পেন্ডিং পেমেন্ট", "💳") + overviewCard("পেন্ডিং অর্ডার", "🧸") + overviewCard("এক্টিভিটি", "🧩");

onSnapshot(collection(db, "children"), s => document.getElementById("ov-শিশু").textContent = s.size);
onSnapshot(collection(db, "activities"), s => document.getElementById("ov-এক্টিভিটি").textContent = s.size);
onSnapshot(query(collection(db, "paymentRequests")), s => {
  document.getElementById("ov-পেন্ডিং পেমেন্ট").textContent = s.docs.filter(d => d.data().status === "pending").length;
});
onSnapshot(query(collection(db, "orders")), s => {
  document.getElementById("ov-পেন্ডিং অর্ডার").textContent = s.docs.filter(d => d.data().status === "pending").length;
});

}
