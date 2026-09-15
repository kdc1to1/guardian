// js/admin.js
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection,
  query, orderBy, onSnapshot, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
document.getElementById("btnAdminLogout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    document.getElementById("admin-login").classList.add("active");
    document.getElementById("adminShell").classList.add("hidden");
    return;
  }
  const adminDoc = await getDoc(doc(db, "admins", user.uid));
  if (adminDoc.exists()) enterAdmin();
});

function enterAdmin() {
  document.getElementById("admin-login").classList.remove("active");
  document.getElementById("adminShell").classList.remove("hidden");
  showScreen("a-overview");
}

/* ---------------- helper: generic add ---------------- */
async function addDocTo(colName, data) {
  await addDoc(collection(db, colName), { ...data, createdAt: serverTimestamp() });
  toast("যুক্ত করা হয়েছে");
}
async function removeDoc(colName, id) {
  if (!confirm("মুছে ফেলতে চান?")) return;
  await deleteDoc(doc(db, colName, id));
}

/* ---------------- ACTIVITIES ---------------- */
document.getElementById("btnAddActivity").addEventListener("click", async () => {
  await addDocTo("activities", {
    title: document.getElementById("actTitle").value.trim(),
    developmentArea: document.getElementById("actDevArea").value.trim(),
    rules: document.getElementById("actRules").value.trim(),
    imageDriveLink: document.getElementById("actImage").value.trim(),
    videoYoutubeLink: document.getElementById("actVideo").value.trim(),
    isFree: document.getElementById("actFree").value === "true",
  });
  ["actTitle","actDevArea","actRules","actImage","actVideo"].forEach(id => document.getElementById(id).value = "");
});
onSnapshot(query(collection(db, "activities"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblActivities tbody"); tb.innerHTML = "";
  const sel = document.getElementById("toolLinkedActivity");
  const prevValue = sel.value;
  sel.innerHTML = `<option value="">-- কোনোটার সাথে নয় --</option>`;
  snap.forEach(d => {
    const a = d.data();
    tb.innerHTML += `<tr><td>${a.title}</td><td>${a.developmentArea||""}</td><td>${a.isFree?"ফ্রি":"পেইড"}</td>
      <td><button class="tiny-btn no" data-del="activities:${d.id}">মুছুন</button></td></tr>`;
    sel.innerHTML += `<option value="${d.id}">${a.title}</option>`;
  });
  sel.value = prevValue;
});

/* ---------------- POEMS ---------------- */
document.getElementById("btnAddPoem").addEventListener("click", async () => {
  await addDocTo("poems", {
    title: document.getElementById("poemTitle").value.trim(),
    poet: document.getElementById("poemPoet").value.trim(),
    learningOutcome: document.getElementById("poemOutcome").value.trim(),
    isFree: document.getElementById("poemFree").value === "true",
  });
  ["poemTitle","poemPoet","poemOutcome"].forEach(id => document.getElementById(id).value = "");
});
onSnapshot(query(collection(db, "poems"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblPoems tbody"); tb.innerHTML = "";
  snap.forEach(d => {
    const p = d.data();
    tb.innerHTML += `<tr><td>${p.title}</td><td>${p.poet||""}</td><td>${p.isFree?"ফ্রি":"পেইড"}</td>
      <td><button class="tiny-btn no" data-del="poems:${d.id}">মুছুন</button></td></tr>`;
  });
});

/* ---------------- STORIES ---------------- */
document.getElementById("btnAddStory").addEventListener("click", async () => {
  await addDocTo("stories", {
    title: document.getElementById("storyTitle").value.trim(),
    author: document.getElementById("storyAuthor").value.trim(),
    learningOutcome: document.getElementById("storyOutcome").value.trim(),
    isFree: document.getElementById("storyFree").value === "true",
  });
  ["storyTitle","storyAuthor","storyOutcome"].forEach(id => document.getElementById(id).value = "");
});
onSnapshot(query(collection(db, "stories"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblStories tbody"); tb.innerHTML = "";
  snap.forEach(d => {
    const s = d.data();
    tb.innerHTML += `<tr><td>${s.title}</td><td>${s.author||""}</td><td>${s.isFree?"ফ্রি":"পেইড"}</td>
      <td><button class="tiny-btn no" data-del="stories:${d.id}">মুছুন</button></td></tr>`;
  });
});

/* ---------------- SITE RULES + KNOW KIDS ---------------- */
getDoc(doc(db, "siteContent", "rules")).then(s => {
  const d = s.data() || {};
  document.getElementById("ruleaPoem").value = d.poemRules || "";
  document.getElementById("ruleaStory").value = d.storyRules || "";
});
document.getElementById("btnSaveRules").addEventListener("click", async () => {
  await setDoc(doc(db, "siteContent", "rules"), {
    poemRules: document.getElementById("ruleaPoem").value.trim(),
    storyRules: document.getElementById("ruleaStory").value.trim(),
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

/* ---------------- TOOLS ---------------- */
document.getElementById("btnAddTool").addEventListener("click", async () => {
  await addDocTo("tools", {
    name: document.getElementById("toolName").value.trim(),
    price: Number(document.getElementById("toolPrice").value) || 0,
    itemsDetails: document.getElementById("toolItems").value.trim(),
    materials: document.getElementById("toolMaterials").value.trim(),
    linkedActivityId: document.getElementById("toolLinkedActivity").value || null,
  });
  ["toolName","toolPrice","toolItems","toolMaterials"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("toolLinkedActivity").value = "";
});
onSnapshot(query(collection(db, "tools"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblTools tbody"); tb.innerHTML = "";
  snap.forEach(d => {
    const t = d.data();
    tb.innerHTML += `<tr><td>${t.name}</td><td>৳${t.price}</td>
      <td><button class="tiny-btn no" data-del="tools:${d.id}">মুছুন</button></td></tr>`;
  });
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
onSnapshot(query(collection(db, "paymentRequests"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblPayments tbody"); tb.innerHTML = "";
  snap.forEach(d => {
    const r = d.data();
    const pillClass = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
    tb.innerHTML += `<tr>
      <td>${r.method}</td><td>${r.transactionId}</td>
      <td><span class="pill ${pillClass}">${r.status}</span></td>
      <td>
        <button class="tiny-btn ok" data-pay-approve="${d.id}:${r.guardianUid}">অ্যাপ্রুভ</button>
        <button class="tiny-btn no" data-pay-reject="${d.id}">বাতিল</button>
      </td></tr>`;
  });
});

/* ---------------- CHILDREN / SHISHU MELA ---------------- */
onSnapshot(query(collection(db, "children"), orderBy("createdAt", "desc")), (snap) => {
  const tb = document.querySelector("#tblChildren tbody"); tb.innerHTML = "";
  snap.forEach(d => {
    const c = d.data();
    tb.innerHTML += `<tr>
      <td>${c.name}</td><td>${c.dob||""}</td><td>${c.level||"শুরু"}</td><td>${c.guardianUid.slice(0,6)}...</td>
      <td><button class="tiny-btn ok" data-level="${d.id}">লেভেল আপডেট</button></td></tr>`;
  });
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
    await updateDoc(doc(db, "paymentRequests", id), { status: "approved", reviewedAt: serverTimestamp() });
    await updateDoc(doc(db, "guardians", guardianUid), { isPremium: true });
    toast("প্রিমিয়াম আনলক করা হয়েছে");
  }
  const reject = e.target.closest("[data-pay-reject]");
  if (reject) {
    await updateDoc(doc(db, "paymentRequests", reject.dataset.payReject), { status: "rejected", reviewedAt: serverTimestamp() });
    toast("বাতিল করা হয়েছে");
  }
  const lvl = e.target.closest("[data-level]");
  if (lvl) {
    const newLevel = prompt("নতুন লেভেল লিখুন (যেমন: লেভেল ২)");
    if (newLevel) await updateDoc(doc(db, "children", lvl.dataset.level), { level: newLevel });
  }
  const receiptBtn = e.target.closest("[data-receipt]");
  if (receiptBtn) openReceipt(receiptBtn.dataset.receipt);
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
