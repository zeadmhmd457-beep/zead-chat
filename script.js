
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

main.innerHTML = `
<section id="login">
<h2>ZEAD CHAT 💬</h2>
<input id="name" placeholder="اسمك">
<input id="email" type="email" placeholder="البريد الإلكتروني">
<input id="password" type="password" placeholder="كلمة المرور">
<button id="register">إنشاء حساب</button>
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

    const result = await createUserWithEmailAndPassword(auth,email,password);
    await set(ref(db,"users/"+result.user.uid),{
      name,
      email
    });

    status.textContent = "تم إنشاء الحساب بنجاح";
  } catch(e) {
    status.textContent = e.message;
  }
};

document.getElementById("loginBtn").onclick = async () => {
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    await signInWithEmailAndPassword(auth,email,password);
  } catch(e) {
    status.textContent = e.message;
  }
};

onAuthStateChanged(auth, async user => {
  if (!user) return;

  const snap = await get(ref(db,"users/"+user.uid));
  const profile = snap.val();

  main.innerHTML = `
  <section id="login">
    <h2>أهلاً ${profile?.name || "بك"} 👋</h2>
    <input id="search" placeholder="ابحث عن مستخدم بالاسم">
    <button id="searchBtn">بحث</button>
    <div id="results"></div>
    <div id="chat"></div>
    <button id="logout">تسجيل الخروج</button>
  </section>
  `;

  document.getElementById("logout").onclick = () => signOut(auth);

  document.getElementById("searchBtn").onclick = async () => {
    const users = await get(ref(db,"users"));
    const results = document.getElementById("results");
    results.innerHTML = "";

    users.forEach(item => {
      const u = item.val();
      if (item.key !== user.uid &&
          u.name?.toLowerCase().includes(
            document.getElementById("search").value.trim().toLowerCase()
          )) {
        const button = document.createElement("button");
        button.textContent = u.name;
        button.onclick = () => openChat(user,item.key,u.name);
        results.appendChild(button);
      }
    });
  };
});

function openChat(user,otherId,otherName) {
  const chatId = [user.uid,otherId].sort().join("_");
  const chat = document.getElementById("chat");

  chat.innerHTML = `
    <h3>محادثة مع ${otherName}</h3>
    <div id="messages"></div>
    <input id="message" placeholder="اكتب رسالتك">
    <button id="send">إرسال</button>
  `;

  const messagesRef = ref(db,"chats/"+chatId+"/messages");

  onValue(messagesRef,snap => {
    const box = document.getElementById("messages");
    if (!box) return;
    box.innerHTML = "";

    snap.forEach(item => {
      const msg = item.val();
      const p = document.createElement("p");
      p.textContent = (msg.sender === user.uid ? "أنا: " : otherName+": ") + msg.text;
      box.appendChild(p);
    });
  });

  document.getElementById("send").onclick = async () => {
    const input = document.getElementById("message");
    const text = input.value.trim();
    if (!text) return;

    await set(ref(db,"chats/"+chatId+"/members/"+user.uid),true);
    await set(ref(db,"chats/"+chatId+"/members/"+otherId),true);

    await push(messagesRef,{
      sender:user.uid,
      text,
      createdAt:Date.now()
    });

    input.value = "";
  };
}

