# Kids Development Center

গার্ডিয়ান-ফেসিং PWA — গেইম/এক্টিভিটি, কবিতা, গল্প, "শিশুদের জানুন", খেলার টুলস মার্কেটপ্লেস ও শিশু মেলা। One To One School-এর সুপারভিশনে।
স্ট্যাক: GitHub Pages (হোস্টিং) + Firebase (Auth, Firestore) — vanilla JavaScript, কোনো বিল্ড স্টেপ নেই।

## ফাইল স্ট্রাকচার

**নোট:** GitHub-এর ওয়েব "Upload files" বাটন সাব-ফোল্ডার (css/, js/, icons/) ঠিকভাবে রাখে না — তাই সব ফাইল এখন একটাই ফ্ল্যাট ফোল্ডারে (কোনো সাব-ফোল্ডার ছাড়া), আর কোডের ভেতরের লিংকগুলোও সেভাবেই সেট করা আছে।

```
index.html          → গার্ডিয়ান অ্যাপ (লগইন/রেজিস্ট্রেশন + ৬টি ফিচার)
admin.html          → এডমিন প্যানেল (আলাদা লিংক, নিজস্ব লগইন)
style.css           → সব স্টাইল
firebase-config.js  → Firebase প্রজেক্ট কনফিগ
app.js              → গার্ডিয়ান অ্যাপের লজিক
admin.js            → এডমিন প্যানেলের লজিক
firestore.rules     → Firestore সিকিউরিটি রুলস
manifest.json       → PWA ম্যানিফেস্ট
sw.js                → অফলাইন সাপোর্ট
icon-192.png, icon-512.png → PWA আইকন
```

GitHub-এ আপলোড করার সময় সব ফাইল একসাথে সিলেক্ট করে "Upload files" পেজে ড্র্যাগ করবেন (কোনো ফোল্ডার তৈরি করবেন না, সব ফাইল রিপোর রুটে/একই লেভেলে থাকবে)।

## ধাপ ১ — Firebase প্রজেক্ট সেটআপ

**নোট:** গার্ডিয়ান ও এডমিন — দুই লগইনই **Email/Password** দিয়ে হয় (Phone OTP নয়), কারণ Phone Authentication ২০২৪ সাল থেকে বিলিং কার্ড (Blaze প্ল্যান) ছাড়া কাজ করে না। Email/Password ৫০,০০০ ইউজার পর্যন্ত Spark (ফ্রি) প্ল্যানে সম্পূর্ণ ফ্রি — কোনো কার্ড লাগে না। হোয়াটসএপ নাম্বার তথ্য-ফিল্ড হিসেবেই থাকে।

1. https://console.firebase.google.com এ গিয়ে নতুন প্রজেক্ট বানান।
2. **Build > Authentication > Sign-in method** থেকে চালু করুন: **Email/Password**।
3. **Build > Firestore Database** থেকে একটি ডাটাবেস বানান (production mode)।
4. **Project settings > General > Your apps** থেকে একটি Web app যুক্ত করুন, এবং যে কনফিগ অবজেক্ট পাবেন তা `firebase-config.js`-এ বসান।
5. Firestore-এর "Rules" ট্যাবে গিয়ে এই রিপোর্জিটরির `firestore.rules` কপি-পেস্ট করে পাবলিশ করুন।

## ধাপ ২ — প্রথম এডমিন একাউন্ট বানানো

1. Authentication ট্যাব থেকে ম্যানুয়ালি একটি ইউজার বানান (Email/Password) — এটাই হবে আপনার এডমিন লগইন।
2. Firestore-এ গিয়ে `admins` কালেকশনে একটি ডকুমেন্ট বানান, ডকুমেন্ট ID = সেই ইউজারের UID (Authentication ট্যাব থেকে UID কপি করবেন), ফিল্ড খালি রাখলেও চলবে (`{ role: "admin" }` দিয়ে দিলেও ভালো)।
3. এখন `admin.html` খুলে সেই ইমেইল/পাসওয়ার্ড দিয়ে লগইন করুন।

## ধাপ ৩ — GitHub Pages-এ হোস্ট করা

1. এই ফোল্ডারটি একটি GitHub রিপোজিটরিতে পুশ করুন।
2. রিপোর Settings > Pages থেকে branch (main) এবং root ফোল্ডার সিলেক্ট করে Save করুন।
3. Firebase Authentication > Settings > Authorized domains-এ আপনার GitHub Pages ডোমেইন (যেমন `username.github.io`) যুক্ত করুন (Firebase ডিফল্টভাবে `localhost` ও `*.firebaseapp.com` রাখে, নতুন ডোমেইন নিজে যুক্ত করতে হয়)।

## ফায়ারস্টোর ডাটা মডেল (সংক্ষেপে)

| Collection | মূল ফিল্ড |
|---|---|
| `guardians/{uid}` | guardianName, relation, otherParentName, whatsapp, email, currentAddress, permanentAddress, isPremium |
| `children/{id}` | guardianUid, name, dob, gender, level |
| `activities/{id}` | title, developmentArea, rules, imageDriveLink, videoYoutubeLink, isFree |
| `poems/{id}` | title, poet, learningOutcome, isFree |
| `stories/{id}` | title, author, learningOutcome, isFree |
| `tools/{id}` | name, price, itemsDetails, materials |
| `siteContent/rules` | poemRules, storyRules (কমন নিয়মাবলী) |
| `siteContent/knowKids` | marqueeText, wordpressTitle, wordpressLink |
| `orders/{id}` | guardianUid, toolId, toolName, quantity, address, whatsapp, status |
| `paymentRequests/{id}` | guardianUid, method, transactionId, status |
| `admins/{uid}` | এডমিন হিসেবে চিহ্নিত করার জন্য (ভ্যালু গুরুত্বপূর্ণ নয়, ডকুমেন্টের অস্তিত্বই যথেষ্ট) |

## সম্পন্ন হয়েছে (আপডেট)

- রশিদ (receipt) — ছবি ও PDF ডাউনলোড, এবং মোবাইলে Web Share API সাপোর্ট থাকলে সরাসরি হোয়াটসএপে শেয়ার (গার্ডিয়ান ও এডমিন — দুই দিকেই "আমার অর্ডারসমূহ" ও এডমিনের অর্ডার টেবিল থেকে)
- এক্টিভিটি ↔ টুলস ক্রস-লিংক — টুলস যোগ করার সময় এডমিন কোন এক্টিভিটির সাথে লিংক করবেন বেছে নিতে পারেন; গার্ডিয়ান এক্টিভিটির বিস্তারিত থেকে "টুলস কিনুন"-এ ক্লিক করলে সরাসরি সেই টুলসের অর্ডার ফর্ম খুলবে
- PWA আইকন (`icon-192.png`, `icon-512.png`) — প্লেসহোল্ডার লোগো, নিজের ডিজাইন দিয়ে বদলে নিতে পারেন
- অফলাইন সাপোর্টের জন্য বেসিক সার্ভিস ওয়ার্কার (`sw.js`) — অ্যাপ শেল ক্যাশ করে, Firebase কল কখনো ক্যাশ করে না

## যা এখনো করা হয়নি (পরের ধাপ)

- Web Share API সব ব্রাউজারে/ডিভাইসে ফাইল-শেয়ার সাপোর্ট করে না (মূলত Android Chrome-এ ভালো কাজ করে); সাপোর্ট না থাকলে ছবি ডাউনলোড করে ম্যানুয়ালি হোয়াটসএপে পাঠাতে হবে
- একটি শিশুর একাধিক progressReports এন্ট্রি রাখার UI এখনো নেই — এডমিন প্যানেলে এখন শুধু children.level ফিল্ড আপডেট হয় (prompt দিয়ে); বিস্তারিত history চাইলে progressReports কালেকশনে আলাদা এন্ট্রি সিস্টেম যোগ করা যাবে
