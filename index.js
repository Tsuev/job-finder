import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "db.json");
const resumePath = path.resolve(__dirname, "resume.pdf");
const statePath = path.resolve(__dirname, "bot-state.json");
const envPath = path.resolve(__dirname, ".env");

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function requiredEnvNumber(name) {
  const raw = requiredEnv(name);
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    throw new Error(`Env var ${name} must be a number`);
  }
  return num;
}

loadEnvFile();

const BOT_TOKEN = requiredEnv("BOT_TOKEN");
const ALLOWED_USER_ID = requiredEnvNumber("ALLOWED_USER_ID");
const ADMIN_CHAT_ID = requiredEnvNumber("ADMIN_CHAT_ID");
const RESERVED_PASSWORD = requiredEnv("RESERVED_PASSWORD");

const apiId = requiredEnvNumber("API_ID");
const apiHash = requiredEnv("API_HASH");

const ENTITY_NOT_FOUND_ERROR = "Cannot find any entity corresponding to";
const USERNAME_NOT_FOUND_ERROR = "No user has";
const USE_TERMINAL_CODE_INPUT = process.argv.includes("--terminal-code") || process.argv.includes("-t");
const AUTO_RUN_TIME_MSK = { hour: 10, minute: 0 };
const AUTO_LIMIT_BY_PHONE = {
  "79259636037": 4,
  "79108693617": 4,
  "79370885096": 4,
  "79298955050": 13,
};
const DEFAULT_AUTO_LIMIT = 4;

const messageTemplates = [
  "Добрый день! Извините за беспокойство\n\nПодскажите, пожалуйста, есть ли у вас сейчас открытые позиции для frontend-разработчиков? У меня около +5 лет опыта (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, рассматриваю middle/senior.\n\nРезюме прикрепил ниже, буду рад обсудить детали.",
  "Здравствуйте! Извините за беспокойство\n\nИнтересуюсь актуальными вакансиями по frontend. У меня ~6 лет коммерческого опыта (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, открыт к middle/senior позициям.\n\nРезюме прикрепил ниже, буду рад обратной связи.",
  "Добрый день! Извините за беспокойство\n\nХотел уточнить, ведёте ли вы сейчас поиск frontend-разработчиков? У меня +5 лет опыта (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, рассматриваю позиции уровня middle/senior.\n\nРезюме прикрепил ниже, спасибо!",
  "Здравствуйте! Извините за беспокойство\n\nРассматриваю новые возможности во frontend-разработке. Опыт — около 6 лет (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, интересны middle/senior роли.\n\nРезюме прикрепил ниже, буду рад пообщаться.",
  "Добрый день! Извините за беспокойство\n\nУвидел ваш профиль и решил написать: есть ли сейчас вакансии по frontend? У меня ~6 лет опыта (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, рассматриваю middle/senior уровень.\n\nРезюме прикрепил ниже, спасибо за внимание.",
  "Здравствуйте! Извините за беспокойство\n\nПодскажите, пожалуйста, актуален ли у вас сейчас найм frontend-разработчиков? У меня +5 лет опыта (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, открыт к предложениям уровня middle/senior.\n\nРезюме прикрепил ниже, буду рад отклику.",
  "Добрый день! Извините за беспокойство\n\nСейчас нахожусь в поиске новых задач во frontend. Опыт около 6 лет (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, рассматриваю middle/senior позиции.\n\nРезюме прикрепил ниже, буду рад обсудить.",
  "Здравствуйте! Извините за беспокойство\n\nХотел узнать, есть ли у вас открытые frontend вакансии? У меня +5 лет опыта (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, интересуют роли уровня middle/senior.\n\nРезюме прикрепил ниже, спасибо!",
  "Добрый день! Извините за беспокойство\n\nИнтересуюсь возможностями во frontend-разработке. Опыт — около 6 лет (Vue, React, Next, Nuxt и во всех смежных технологиях, некоторые не указаны в резюме) также есть опыт ведения проектов и команд, рассматриваю middle/senior позиции.\n\nРезюме прикрепил ниже, буду рад обратной связи.",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelayMs = (minSec, maxSec) =>
  Math.floor((Math.random() * (maxSec - minSec) + minSec) * 1000);
const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];
const isValidUsername = (username) =>
  typeof username === "string" && /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username);

const appState = {
  flow: {
    step: "idle",
    dailyLimit: null,
    phone: "",
    password: "",
    code: "",
    codeResolver: null,
    chatId: null,
    running: false,
  },
  saved: {
    lastPhone: "",
    sessionsByPhone: {},
    adminChatId: ADMIN_CHAT_ID,
    autoLastRunDateMsk: "",
  },
};

function loadState() {
  if (!fs.existsSync(statePath)) return;
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    const saved = parsed?.saved || {};
    appState.saved.lastPhone = saved?.lastPhone || "";
    appState.saved.sessionsByPhone =
      saved?.sessionsByPhone && typeof saved.sessionsByPhone === "object"
        ? saved.sessionsByPhone
        : {};
    appState.saved.adminChatId = Number.isInteger(saved?.adminChatId) ? saved.adminChatId : null;
    appState.saved.autoLastRunDateMsk = typeof saved?.autoLastRunDateMsk === "string" ? saved.autoLastRunDateMsk : "";

    if (saved?.phone && saved?.session) {
      appState.saved.lastPhone = saved.phone;
      appState.saved.sessionsByPhone[saved.phone] = saved.session;
    }
  } catch (error) {
    console.error("Не удалось прочитать bot-state.json:", error);
  }
}

function saveState() {
  const data = {
    saved: {
      lastPhone: appState.saved.lastPhone,
      sessionsByPhone: appState.saved.sessionsByPhone,
      adminChatId: appState.saved.adminChatId,
      autoLastRunDateMsk: appState.saved.autoLastRunDateMsk,
    },
  };
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2) + "\n");
}

async function botApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Bot API error (${method}): ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return botApi("sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

function resetFlow() {
  if (typeof appState.flow.codeResolver === "function") {
    appState.flow.codeResolver("");
  }
  appState.flow.step = "idle";
  appState.flow.dailyLimit = null;
  appState.flow.phone = "";
  appState.flow.password = "";
  appState.flow.code = "";
  appState.flow.codeResolver = null;
  appState.flow.chatId = null;
  appState.flow.running = false;
}

function getMskDateParts(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(formatted.map((item) => [item.type, item.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function getAutoLimitForPhone(phone) {
  const digits = normalizePhoneDigits(phone);
  return AUTO_LIMIT_BY_PHONE[digits] ?? DEFAULT_AUTO_LIMIT;
}

function formatRunTimeMsk() {
  const hh = String(AUTO_RUN_TIME_MSK.hour).padStart(2, "0");
  const mm = String(AUTO_RUN_TIME_MSK.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getSessionsSummaryLines() {
  const sessions = Object.keys(appState.saved.sessionsByPhone || {}).filter(Boolean);
  if (!sessions.length) return ["Сессии не сохранены."];
  return sessions.map((phone, idx) => {
    const limit = getAutoLimitForPhone(phone);
    return `${idx + 1}. ${phone} -> лимит ${limit}`;
  });
}

async function startFlow(chatId) {
  appState.flow.step = "waiting_limit";
  appState.flow.chatId = chatId;
  appState.flow.dailyLimit = null;
  appState.flow.phone = appState.saved.lastPhone || "";
  appState.flow.password = RESERVED_PASSWORD;
  appState.flow.code = "";
  appState.flow.codeResolver = null;

  await sendMessage(chatId, "Сколько контактов обработать за этот запуск? Введите число.");
}

async function handleFlowInput(chatId, text) {
  const step = appState.flow.step;

  if (step === "waiting_limit") {
    const limit = Number(text.trim());
    if (!Number.isInteger(limit) || limit <= 0) {
      await sendMessage(chatId, "Введите целое число больше 0.");
      return;
    }

    appState.flow.dailyLimit = limit;
    appState.flow.step = "waiting_phone";

    if (appState.saved.lastPhone) {
      const hasSession = Boolean(appState.saved.sessionsByPhone[appState.saved.lastPhone]);
      const savedPhones = Object.keys(appState.saved.sessionsByPhone || {}).filter(Boolean);
      const keyboard = [
        ...savedPhones.map((phone) => [{ text: `Использовать ${phone}`, callback_data: `use_saved_phone:${phone}` }]),
        [{ text: "Ввести новый номер", callback_data: "enter_new_phone" }],
      ];

      await sendMessage(
        chatId,
        `Сохраненный номер: ${appState.saved.lastPhone}${hasSession ? " (сессия сохранена)" : ""}\nВыберите сохраненную сессию на кнопке или введите новый номер.`,
        {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        },
      );
      return;
    }

    await sendMessage(chatId, "Введите номер телефона в формате +79991234567");
    return;
  }

  if (step === "waiting_phone") {
    const value = text.trim();

    appState.flow.phone = value;
    appState.saved.lastPhone = value;
    saveState();

    appState.flow.step = "running";
    appState.flow.running = true;
    appState.flow.password = RESERVED_PASSWORD;

    await sendMessage(chatId, "Использую зарезервированный пароль. Запускаю авторизацию и отклики...");
    runOutreach().catch(async (error) => {
      console.error(error);
      await sendMessage(chatId, `Ошибка запуска: ${String(error?.message || error)}`);
      resetFlow();
    });
    return;
  }

  if (step === "waiting_code") {
    const value = text.trim();
    if (!value) {
      await sendMessage(chatId, "Введите код из Telegram.");
      return;
    }

    appState.flow.code = value;
    const resolver = appState.flow.codeResolver;
    appState.flow.codeResolver = null;
    appState.flow.step = "running";

    if (resolver) {
      resolver(value);
      await sendMessage(chatId, "Код получен, продолжаю.");
    } else {
      await sendMessage(chatId, "Сейчас код не запрашивался. Дождитесь сообщения от бота.");
    }
  }
}

async function waitForPhoneCode(chatId) {
  if (USE_TERMINAL_CODE_INPUT) {
    const code = await input.text("Введите код из Telegram: ");
    return String(code || "").trim();
  }

  if (appState.flow.code) {
    const code = appState.flow.code;
    appState.flow.code = "";
    return code;
  }

  if (chatId) {
    appState.flow.step = "waiting_code";
    await sendMessage(chatId, "Введите код из Telegram, который только что пришел.");

    return new Promise((resolve) => {
      appState.flow.codeResolver = (value) => {
        appState.flow.code = "";
        resolve(value);
      };
    });
  }

  throw new Error("Требуется код Telegram, но chatId для ввода кода отсутствует");
}

async function runOutreachForPhone({ phone, dailyLimit, chatId = null }) {
  if (!fs.existsSync(dbPath)) {
    if (chatId) await sendMessage(chatId, `Ошибка: не найден файл ${dbPath}`);
    return;
  }

  if (!fs.existsSync(resumePath)) {
    if (chatId) await sendMessage(chatId, `Ошибка: не найден файл ${resumePath}`);
    return;
  }

  const existingSession = appState.saved.sessionsByPhone[phone] || "";
  if (!existingSession) {
    if (chatId) await sendMessage(chatId, `Пропуск ${phone}: нет сохраненной сессии.`);
    return;
  }

  const stringSession = new StringSession(existingSession);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => phone,
    password: async () => RESERVED_PASSWORD,
    phoneCode: async () => waitForPhoneCode(chatId),
    onError: (error) => console.error("Auth error:", error),
  });

  appState.saved.lastPhone = phone;
  appState.saved.sessionsByPhone[phone] = client.session.save();
  saveState();

  if (chatId) await sendMessage(chatId, `Авторизация успешна (${phone}). Начинаю рассылку.`);

  const raw = fs.readFileSync(dbPath, "utf8");
  const contacts = JSON.parse(raw);
  const validContacts = contacts.filter((item) => item && isValidUsername(item.username));

  const pendingContacts = validContacts
    .filter((item) => item.is_sent !== true && item.is_send !== true)
    .slice(0, dailyLimit);

  let sent = 0;
  let failed = 0;
  let stoppedByPeerFlood = false;

  if (chatId) await sendMessage(chatId, `В работу взято контактов (${phone}): ${pendingContacts.length}`);

  for (const contact of pendingContacts) {
    if (!appState.flow.running) break;

    const { username } = contact;

    try {
      const messageText = pickRandom(messageTemplates);
      await client.sendMessage(username, { message: messageText });
      await client.sendFile(username, {
        file: resumePath,
        forceDocument: true,
      });

      contact.is_sent = true;
      fs.writeFileSync(dbPath, JSON.stringify(contacts, null, 2) + "\n");

      sent += 1;
      if (chatId) await sendMessage(chatId, `✅ ${phone}: отправлено ${username}`);
    } catch (error) {
      failed += 1;
      const message = String(error?.message || error);
      if (chatId) await sendMessage(chatId, `❌ ${phone}: ошибка для ${username}: ${message}`);

      if (message.toUpperCase().includes("PEER_FLOOD")) {
        stoppedByPeerFlood = true;
        appState.flow.running = false;
        if (chatId) await sendMessage(chatId, `⛔️ ${phone}: получен PEER_FLOOD. Отклики остановлены.`);
        break;
      }

      if (message.includes(ENTITY_NOT_FOUND_ERROR) || message.includes(USERNAME_NOT_FOUND_ERROR)) {
        const idx = contacts.indexOf(contact);
        if (idx !== -1) {
          contacts.splice(idx, 1);
          fs.writeFileSync(dbPath, JSON.stringify(contacts, null, 2) + "\n");
          if (chatId) await sendMessage(chatId, `🧹 ${phone}: удален из базы ${username}`);
        }
      }
    }

    if (!appState.flow.running) break;

    const delay = randomDelayMs(20, 40);
    if (chatId) await sendMessage(chatId, `⏳ ${phone}: пауза ${Math.round(delay / 1000)} сек...`);
    await sleep(delay);
  }

  await client.disconnect();

  if (chatId) {
    await sendMessage(
      chatId,
      `Готово (${phone}). Успешно: ${sent}, ошибок: ${failed}${stoppedByPeerFlood ? ", остановлено из-за PEER_FLOOD" : ""}`,
    );
  }
}

async function runOutreach() {
  const chatId = appState.flow.chatId;
  if (!chatId) return;

  try {
    await runOutreachForPhone({
      phone: appState.flow.phone,
      dailyLimit: appState.flow.dailyLimit,
      chatId,
    });
  } finally {
    resetFlow();
  }
}

async function runAutoOutreach() {
  if (appState.flow.running) return;

  const sessions = Object.keys(appState.saved.sessionsByPhone || {}).filter(Boolean);
  if (!sessions.length) {
    console.log("[auto] Нет сохраненных сессий, пропуск");
    return;
  }

  const chatId = appState.saved.adminChatId;
  appState.flow.running = true;

  if (chatId) await sendMessage(chatId, `⏰ Автозапуск в 10:00 МСК. Сессий: ${sessions.length}`);

  try {
    for (const phone of sessions) {
      const limit = getAutoLimitForPhone(phone);
      if (chatId) await sendMessage(chatId, `▶️ Запуск ${phone}, лимит ${limit}`);
      await runOutreachForPhone({ phone, dailyLimit: limit, chatId });
    }
  } catch (error) {
    console.error("[auto] Ошибка автозапуска:", error);
    if (chatId) await sendMessage(chatId, `[auto] Ошибка: ${String(error?.message || error)}`);
  } finally {
    appState.flow.running = false;
    appState.flow.step = "idle";
  }
}

function startAutoScheduler() {
  setInterval(async () => {
    try {
      const now = getMskDateParts();
      const isRunTime = now.hour === AUTO_RUN_TIME_MSK.hour && now.minute === AUTO_RUN_TIME_MSK.minute;
      const alreadyRanToday = appState.saved.autoLastRunDateMsk === now.date;

      if (!isRunTime || alreadyRanToday) return;

      appState.saved.autoLastRunDateMsk = now.date;
      saveState();
      await runAutoOutreach();
    } catch (error) {
      console.error("[auto] Планировщик:", error);
    }
  }, 30_000);
}

async function handleUpdate(update) {
  const message = update.message;
  const callbackQuery = update.callback_query;

  if (callbackQuery) {
    const userId = callbackQuery.from?.id;
    const chatId = callbackQuery.message?.chat?.id;
    const data = callbackQuery.data;

    await botApi("answerCallbackQuery", { callback_query_id: callbackQuery.id });

    if (userId !== ALLOWED_USER_ID || !chatId) return;

    if (data === "start_outreach") {
      if (appState.flow.running) {
        await sendMessage(chatId, "Отклики уже запущены.");
        return;
      }
      await startFlow(chatId);
    }

    if (appState.flow.step === "waiting_phone" && data === "enter_new_phone") {
      await sendMessage(chatId, "Введите номер телефона в формате +79991234567");
    }

    if (appState.flow.step === "waiting_phone" && data?.startsWith("use_saved_phone:")) {
      const phone = data.slice("use_saved_phone:".length).trim();
      if (!phone) {
        await sendMessage(chatId, "Не удалось определить номер из кнопки. Введите номер вручную.");
        return;
      }

      appState.flow.phone = phone;
      appState.saved.lastPhone = phone;
      appState.flow.password = RESERVED_PASSWORD;
      saveState();

      appState.flow.step = "running";
      appState.flow.running = true;
      await sendMessage(chatId, `Выбрана сессия: ${phone}. Использую зарезервированный пароль. Запускаю...`);

      runOutreach().catch(async (error) => {
        console.error(error);
        await sendMessage(chatId, `Ошибка запуска: ${String(error?.message || error)}`);
        resetFlow();
      });
    }

    return;
  }

  if (!message?.from?.id || !message.chat?.id) return;
  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text || "";

  if (userId !== ALLOWED_USER_ID) {
    await sendMessage(chatId, "Доступ запрещен.");
    return;
  }

  appState.saved.adminChatId = chatId;
  saveState();

  if (text === "/start") {
    await sendMessage(chatId, "Нажмите кнопку, чтобы начать отклики.", {
      reply_markup: {
        inline_keyboard: [[{ text: "Начать отклики", callback_data: "start_outreach" }]],
      },
    });
    return;
  }

  if (text === "/restart") {
    appState.flow.running = false;
    resetFlow();
    await sendMessage(chatId, "Сценарий перезапущен. Нажмите кнопку, чтобы начать отклики заново.", {
      reply_markup: {
        inline_keyboard: [[{ text: "Начать отклики", callback_data: "start_outreach" }]],
      },
    });
    return;
  }

  if (text === "/status") {
    const now = getMskDateParts();
    const sessions = Object.keys(appState.saved.sessionsByPhone || {}).filter(Boolean);
    const statusText = [
      "Статус бота:",
      `- Запущен процесс: да`,
      `- Выполняется задача: ${appState.flow.running ? "да" : "нет"}`,
      `- Шаг flow: ${appState.flow.step}`,
      `- Сохранено сессий: ${sessions.length}`,
      `- Последний авторан (МСК дата): ${appState.saved.autoLastRunDateMsk || "не было"}`,
      `- Следующий слот авторана: ежедневно в ${formatRunTimeMsk()} МСК`,
      `- Сейчас (МСК): ${now.date} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
    ].join("\n");
    await sendMessage(chatId, statusText);
    return;
  }

  if (text === "/sessions") {
    const lines = getSessionsSummaryLines();
    await sendMessage(chatId, ["Сохраненные сессии и лимиты:", ...lines].join("\n"));
    return;
  }

  if (text === "/run_auto_now") {
    if (appState.flow.running) {
      await sendMessage(chatId, "Сейчас уже идет запуск. Дождитесь завершения.");
      return;
    }
    await sendMessage(chatId, "Запускаю автоотклики вручную по всем сессиям...");
    runAutoOutreach().catch(async (error) => {
      console.error("[manual auto] Ошибка:", error);
      await sendMessage(chatId, `Ошибка /run_auto_now: ${String(error?.message || error)}`);
    });
    return;
  }

  if (appState.flow.step !== "idle" && appState.flow.step !== "running") {
    await handleFlowInput(chatId, text);
    return;
  }

  if (appState.flow.step === "running") {
    await sendMessage(chatId, "Отклики уже выполняются. Дождитесь завершения.");
  }
}

async function main() {
  loadState();
  appState.saved.adminChatId = ADMIN_CHAT_ID;
  saveState();
  startAutoScheduler();

  let offset = 0;
  console.log("Бот запущен");

  while (true) {
    try {
      const updates = await botApi("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      console.error("Polling error:", error);
      await sleep(2000);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
