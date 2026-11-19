
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDR7G25A8WR3AKT_O6TyJms4CObcPbGyw0",
  authDomain: "zead-chat.firebaseapp.com",
  databaseURL: "https://zead-chat-default-rtdb.firebaseio.com",
  projectId: "zead-chat",
  storageBucket: "zead-chat.firebasestorage.app",
  messagingSenderId: "249982910342",
  appId: "1:249982910342:web:97a2384a561c92c1d53607"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const main = document.getElementById("main");
const logoutBtn = document.getElementById("logout");

let currentUser = null;
let currentChatId = null;
let activeMessagesUnsub = null;
let listUnsub = null;
let messageListUnsubs = new Map();
let chatInfo = new Map();

function escapeText(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showLogin() {
  logoutBtn.style.display = "none";

  main.innerHTML = `
    <section id="login">
      <h2>أهلاً بيك 👋</h2>
      <input id="name" placeholder="اسمك">
      <input id="email" type="email" placeholder="البريد الإلكتروني">
      <input id="password" type="password" placeholder="كلمة المرور">
      <button id="register">إنشاء حساب جديد</button>
      <button id="loginBtn">تسجيل الدخول</button>
      <p id="status"></p>
    </section>
  `;

  const status = document.getElementById("status");

  document.getElementById("register").onclick = async () => {
    try {
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      if (!name || !email || password.length < 6) {
        status.textContent = "اكتب بيانات صحيحة وكلمة مرور 6 أحرف على الأقل";
        return;
      }

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await set(ref(db, "publicUsers/" + result.user.uid), {
        name
      });

      status.textContent = "تم إنشاء الحساب بنجاح";
    } catch (error) {
      status.textContent = error.message;
    }
  };

  document.getElementById("loginBtn").onclick = async () => {
    try {
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      status.textContent = error.message;
    }
  };
}

async function startApp(user) {
  currentUser = user;
  currentChatId = null;
  chatInfo.clear();

  logoutBtn.style.display = "block";
  logoutBtn.onclick = () => signOut(auth);

  const profileSnap = await get(
    ref(db, "publicUsers/" + user.uid)
  );

  let profile = profileSnap.val();

  if (!profile) {
    profile = {
      name: user.email.split("@")[0]
    };

    await set(ref(db, "publicUsers/" + user.uid), profile);
  }

  main.innerHTML = `
    <section id="home">
      <div class="welcome">
        <h2>أهلاً ${escapeText(profile.name)} 👋</h2>
        <p>رسائلك ومحادثاتك</p>
      </div>

      <div class="search-area">
        <input id="search" placeholder="ابحث عن شخص بالاسم">
        <button id="searchBtn">بحث</button>
      </div>

      <div id="results"></div>

      <h3 class="section-title">المحادثات</h3>
      <div id="chatList">جاري تحميل المحادثات...</div>

      <div id="chat"></div>
    </section>
  `;

  document.getElementById("searchBtn").onclick = searchUsers;

  document.getElementById("search").addEventListener("keydown", event => {
    if (event.key === "Enter") searchUsers();
  });

  loadChatList();
}

async function searchUsers() {
  const term = document.getElementById("search").value.trim().toLowerCase();
  const results = document.getElementById("results");

  results.innerHTML = "";

  if (!term) {
    results.textContent = "اكتب اسم الشخص للبحث";
    return;
  }

  try {
    const snap = await get(ref(db, "publicUsers"));

    snap.forEach(item => {
      const person = item.val();

      if (
        item.key !== currentUser.uid &&
        person.name &&
        person.name.toLowerCase().includes(term)
      ) {
        const button = document.createElement("button");
        button.className = "user-result";
        button.textContent = "👤 " + person.name;

        button.onclick = () => openChat(item.key, person.name);

        results.appendChild(button);
      }
    });

    if (!results.children.length) {
      results.textContent = "لم يتم العثور على مستخدم";
    }
  } catch (error) {
    results.textContent = "حدث خطأ أثناء البحث";
    console.error(error);
  }
}

async function loadChatList() {
  if (listUnsub) listUnsub();

  const userChatsRef = ref(
    db,
    "userChats/" + currentUser.uid
  );

  listUnsub = onValue(userChatsRef, async snap => {
    const ids = [];

    snap.forEach(item => {
      if (item.val() === true) ids.push(item.key);
    });

    for (const [id, unsubscribe] of messageListUnsubs) {
      if (!ids.includes(id)) {
        unsubscribe();
        messageListUnsubs.delete(id);
        chatInfo.delete(id);
      }
    }

    for (const chatId of ids) {
      if (!chatInfo.has(chatId)) {
        try {
          const membersSnap = await get(
            ref(db, "chats/" + chatId + "/members")
          );

          const members = membersSnap.val() || {};

          const otherId = Object.keys(members).find(
            id => id !== currentUser.uid && members[id] === true
          );

          if (!otherId) continue;

          const personSnap = await get(
            ref(db, "publicUsers/" + otherId)
          );

          const person = personSnap.val() || {};

          chatInfo.set(chatId, {
            otherId,
            name: person.name || "مستخدم"
          });
        } catch (error) {
          console.error(error);
          continue;
        }
      }

      if (!messageListUnsubs.has(chatId)) {
        const messagesRef = ref(
          db,
          "chats/" + chatId + "/messages"
        );

        const unsubscribe = onValue(messagesRef, messageSnap => {
          const messages = [];

          messageSnap.forEach(item => {
            messages.push(item.val());
          });

          const last = messages[messages.length - 1];
          const info = chatInfo.get(chatId);

          if (info) {
            info.lastText = last?.text || "ابدأ المحادثة";
            info.lastTime = last?.createdAt || 0;
          }

          renderChatList();
        });

        messageListUnsubs.set(chatId, unsubscribe);
      }
    }

    renderChatList();
  });
}

function renderChatList() {
  const list = document.getElementById("chatList");
  if (!list) return;

  list.innerHTML = "";

  const entries = [...chatInfo.entries()].sort(
    (a, b) => (b[1].lastTime || 0) - (a[1].lastTime || 0)
  );

  if (!entries.length) {
    list.textContent = "لسه مفيش محادثات. ابحث عن شخص وابدأ الكلام 💬";
    return;
  }

  entries.forEach(([chatId, info]) => {
    const button = document.createElement("button");
    button.className = "chat-item";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = "👤";

    const details = document.createElement("span");
    details.className = "chat-details";

    const name = document.createElement("strong");
    name.textContent = info.name;

    const last = document.createElement("small");
    last.textContent = info.lastText || "ابدأ المحادثة";

    const time = document.createElement("small");
    time.className = "chat-time";
    time.textContent = formatTime(info.lastTime);

    details.append(name, last);
    button.append(avatar, details, time);

    button.onclick = () => openChat(info.otherId, info.name);

    list.appendChild(button);
  });
}

async function openChat(otherId, otherName) {
  const chatId = getChatId(currentUser.uid, otherId);
  const membersRef = ref(db, "chats/" + chatId + "/members");

  try {
    const membersSnap = await get(membersRef);

    if (!membersSnap.exists()) {
      await set(membersRef, {
        [currentUser.uid]: true,
        [otherId]: true
      });
    }

    await Promise.all([
      set(ref(db, "userChats/" + currentUser.uid + "/" + chatId), true),
      set(ref(db, "userChats/" + otherId + "/" + chatId), true)
    ]);

    currentChatId = chatId;

    const chat = document.getElementById("chat");

    chat.innerHTML = `
      <div class="chat-heading">
        <button id="backBtn">رجوع</button>
        <h3>${escapeText(otherName)}</h3>
      </div>

      <div id="messages">جاري تحميل الرسائل...</div>

      <div class="send-area">
        <input id="message" placeholder="اكتب رسالتك">
        <button id="send">إرسال</button>
      </div>
    `;

    document.getElementById("backBtn").onclick = () => {
      if (activeMessagesUnsub) {
        activeMessagesUnsub();
        activeMessagesUnsub = null;
      }

      currentChatId = null;
      chat.innerHTML = "";
    };

    const messagesRef = ref(
      db,
      "chats/" + chatId + "/messages"
    );

    if (activeMessagesUnsub) activeMessagesUnsub();

    activeMessagesUnsub = onValue(messagesRef, snap => {
      const box = document.getElementById("messages");

      if (!box || currentChatId !== chatId) return;

      box.innerHTML = "";

      snap.forEach(item => {
        const msg = item.val();

        const bubble = document.createElement("div");
        bubble.className =
          msg.sender === currentUser.uid
            ? "my-message"
            : "their-message";

        const content = document.createElement("p");
        content.textContent = msg.text;

        const time = document.createElement("small");
        time.textContent = formatTime(msg.createdAt);

        bubble.append(content, time);
        box.appendChild(bubble);
      });

      box.scrollTop = box.scrollHeight;
    });

    document.getElementById("send").onclick = sendMessage;

    document.getElementById("message").addEventListener("keydown", event => {
      if (event.key === "Enter") sendMessage();
    });

  } catch (error) {
    alert("تعذر فتح المحادثة: " + error.message);
    console.error(error);
  }
}

async function sendMessage() {
  const input = document.getElementById("message");
  const text = input.value.trim();

  if (!text || !currentChatId) return;

  if (text.length > 2000) {
    alert("الرسالة طويلة جدًا");
    return;
  }

  try {
    await push(
      ref(db, "chats/" + currentChatId + "/messages"),
      {
        sender: currentUser.uid,
        text,
        createdAt: Date.now()
      }
    );

    input.value = "";
  } catch (error) {
    alert("لم يتم إرسال الرسالة: " + error.message);
    console.error(error);
  }
}

onAuthStateChanged(auth, user => {
  if (user) {
    startApp(user).catch(error => {
      console.error(error);
      alert("حصل خطأ في تحميل الموقع: " + error.message);
    });
  } else {
    currentUser = null;

    if (listUnsub) {
      listUnsub();
      listUnsub = null;
    }

    if (activeMessagesUnsub) {
      activeMessagesUnsub();
      activeMessagesUnsub = null;
    }

    for (const unsubscribe of messageListUnsubs.values()) {
      unsubscribe();
    }

    messageListUnsubs.clear();
    chatInfo.clear();

    showLogin();
  }
});

