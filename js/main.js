// ---------- Данные ----------
// Цены вымышленные и указаны в леях
const services = [
  { id: "consult", price: 200 },
  { id: "clean", price: 900 },
  { id: "filling", price: 800 },
  { id: "extraction", price: 700 },
  { id: "rootcanal", price: 2000 },
  { id: "whitening", price: 3500 },
  { id: "crown", price: 4500 },
  { id: "implant", price: 14000 }
];

const EUR_RATE = 20; // условный курс для демо: 1 евро = 20 леев
const TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

// ---------- Состояние: всё, что меняется, пока открыта страница ----------
const state = {
  lang: readStorage("molara-lang", "ro"),
  currency: "MDL",
  quantities: {},     // например { clean: 1, filling: 2 }
  selectedSlot: null,
  bookings: readStorage("molara-bookings", [])
};

// ---------- Работа с localStorage ----------
// try/catch нужен потому, что в приватном режиме хранилище может быть недоступно
function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Без сохранения сайт всё равно работает до перезагрузки
  }
}

// ---------- Переводы ----------
function t(key) {
  return translations[state.lang][key] ?? key;
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = t("pageTitle");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.lang === state.lang);
  });

  clearErrors();
  renderServices();
  renderSlots();
}

// ---------- Калькулятор ----------
function formatMoney(amountInLei) {
  const amount = state.currency === "EUR" ? Math.round(amountInLei / EUR_RATE) : amountInLei;
  return `${amount.toLocaleString("ru-RU")} ${state.currency}`;
}

function renderServices() {
  const list = document.getElementById("serviceList");

  list.innerHTML = services.map((service) => {
    const quantity = state.quantities[service.id] || 0;
    const name = t(`service_${service.id}`);
    return `
      <li class="calc__item">
        <div>
          <span class="calc__name">${name}</span>
          <span class="calc__price">${formatMoney(service.price)} ${t("perUnit")}</span>
        </div>
        <div class="stepper">
          <button type="button" data-action="decrease" data-id="${service.id}"
            aria-label="${t("decrease")}: ${name}" ${quantity === 0 ? "disabled" : ""}>−</button>
          <output>${quantity}</output>
          <button type="button" data-action="increase" data-id="${service.id}"
            aria-label="${t("increase")}: ${name}">+</button>
        </div>
      </li>`;
  }).join("");

  const total = services.reduce((sum, service) => {
    return sum + service.price * (state.quantities[service.id] || 0);
  }, 0);

  document.getElementById("calcTotal").textContent = formatMoney(total);

  document.querySelectorAll("[data-currency]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.currency === state.currency);
  });
}

function changeQuantity(id, delta) {
  const nextValue = (state.quantities[id] || 0) + delta;
  state.quantities[id] = Math.max(0, nextValue);
  renderServices();
}

// Переносит выбранные услуги в комментарий формы записи
function usePlanInBooking() {
  const chosen = services
    .filter((service) => state.quantities[service.id] > 0)
    .map((service) => `${t(`service_${service.id}`)} × ${state.quantities[service.id]}`);

  if (chosen.length > 0) {
    document.getElementById("comment").value = `${t("planPrefix")}: ${chosen.join(", ")}`;
  }

  document.getElementById("programare").scrollIntoView();
  document.getElementById("name").focus({ preventScroll: true });
}

// ---------- Запись на приём ----------
// Дата в формате 2026-11-05 по местному времени браузера
function toDateValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getTomorrowValue() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toDateValue(tomorrow);
}

// T12:00 защищает от сдвига даты из-за часового пояса
function isSunday(dateValue) {
  return new Date(`${dateValue}T12:00`).getDay() === 0;
}

// Без сервера занятость имитируем: часть часов зависит от числа месяца,
// остальное берём из записей, которые сохранил сам пользователь
function isSlotTaken(dateValue, time, index) {
  const dayOfMonth = Number(dateValue.slice(-2));
  const demoBusy = (dayOfMonth + index) % 4 === 0;
  const alreadyBooked = state.bookings.some((b) => b.date === dateValue && b.time === time);
  return demoBusy || alreadyBooked;
}

function renderSlots() {
  const container = document.getElementById("slots");
  const dateValue = document.getElementById("date").value;

  if (!dateValue || dateValue < getTomorrowValue()) {
    container.innerHTML = `<p class="slots__hint">${t("slotsPickDate")}</p>`;
    return;
  }
  if (isSunday(dateValue)) {
    container.innerHTML = `<p class="slots__hint">${t("slotsSunday")}</p>`;
    return;
  }

  container.innerHTML = TIMES.map((time, index) => {
    const taken = isSlotTaken(dateValue, time, index);
    const selected = state.selectedSlot === time;
    return `<button type="button" class="slot" data-time="${time}"
      aria-pressed="${selected}" ${taken ? "disabled" : ""}>${time}</button>`;
  }).join("");
}

function showError(id, message) {
  document.getElementById(id).textContent = message;
}

function clearErrors() {
  document.querySelectorAll(".error").forEach((element) => {
    element.textContent = "";
  });
}

// Возвращает true, если все поля заполнены правильно
function validateBooking(name, phone, date) {
  clearErrors();
  let isValid = true;

  if (name.length < 2) {
    showError("nameError", t("errName"));
    isValid = false;
  }
  // Номер Молдовы: +373 и 8 цифр или 0 и 8 цифр
  if (!/^(\+373|0)\d{8}$/.test(phone.replace(/[\s()-]/g, ""))) {
    showError("phoneError", t("errPhone"));
    isValid = false;
  }
  if (!date || date < getTomorrowValue() || isSunday(date)) {
    showError("dateError", t("errDate"));
    isValid = false;
  } else if (!state.selectedSlot) {
    showError("slotError", t("errSlot"));
    isValid = false;
  }
  return isValid;
}

function submitBooking(event) {
  event.preventDefault();

  const form = event.target;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const date = form.date.value;

  if (!validateBooking(name, phone, date)) return;

  state.bookings.push({ date, time: state.selectedSlot });
  writeStorage("molara-bookings", state.bookings);

  const prettyDate = new Date(`${date}T12:00`).toLocaleDateString(state.lang, {
    day: "numeric",
    month: "long"
  });

  document.getElementById("successText").textContent = t("successText")
    .replace("{name}", name)
    .replace("{date}", prettyDate)
    .replace("{time}", state.selectedSlot);
  document.getElementById("successDialog").showModal();

  form.reset();
  state.selectedSlot = null;
  renderSlots();
}

// ---------- Обработчики событий ----------
document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    state.lang = button.dataset.lang;
    writeStorage("molara-lang", state.lang);
    applyLanguage();
  });
});

document.querySelectorAll("[data-currency]").forEach((button) => {
  button.addEventListener("click", () => {
    state.currency = button.dataset.currency;
    renderServices();
  });
});

// Один обработчик на весь список: кнопки внутри него пересоздаются при каждом обновлении
document.getElementById("serviceList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  changeQuantity(button.dataset.id, button.dataset.action === "increase" ? 1 : -1);
});

document.getElementById("usePlan").addEventListener("click", usePlanInBooking);

document.getElementById("date").addEventListener("change", () => {
  state.selectedSlot = null;
  renderSlots();
});

document.getElementById("slots").addEventListener("click", (event) => {
  const button = event.target.closest("[data-time]");
  if (!button) return;
  state.selectedSlot = button.dataset.time;
  renderSlots();
});

document.getElementById("bookingForm").addEventListener("submit", submitBooking);

const menuButton = document.getElementById("menuButton");
const nav = document.getElementById("nav");

menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", isOpen);
});

nav.addEventListener("click", (event) => {
  if (event.target.tagName === "A") {
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", false);
  }
});

// ---------- Запуск ----------
document.getElementById("date").min = getTomorrowValue();
applyLanguage();
