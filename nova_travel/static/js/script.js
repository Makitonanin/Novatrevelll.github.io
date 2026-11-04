// Nova Travel: каталог, бронирование и интерактивные блоки без библиотек.
document.addEventListener("DOMContentLoaded", () => {
  const tourGrid = document.getElementById("tourGrid");
  const tourSelect = document.getElementById("tourSelect");
  const bookingForm = document.getElementById("bookingForm");
  const formMessage = document.getElementById("formMessage");
  let tours = [];

  const money = value => new Intl.NumberFormat("ru-RU").format(value) + " ₽";
  const palettes = ["linear-gradient(135deg,#9ac9b8,#267d82 55%,#103d55)", "linear-gradient(135deg,#c3d4b0,#608b79 55%,#24495a)", "linear-gradient(135deg,#d2b28c,#8b8970 55%,#385a60)", "linear-gradient(135deg,#d6ad7c,#a86e51 55%,#384e56)", "linear-gradient(135deg,#f1d18e,#d58d50 55%,#785b48)", "linear-gradient(135deg,#a9d8d1,#4d9ba0 55%,#164c67)"];

  async function loadTours() {
    try {
      const response = await fetch("/api/tours");
      if (!response.ok) throw new Error("Не удалось загрузить каталог");
      const payload = await response.json();
      tours = payload.tours || [];
      renderTours();
      tourSelect.innerHTML = '<option value="">Выберите маршрут</option>' +
        tours.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)} — ${money(t.price)}</option>`).join("");
    } catch (error) {
      tourGrid.innerHTML = '<p class="loading-state">Не удалось загрузить туры. Обновите страницу или проверьте, запущен ли Flask.</p>';
      tourSelect.innerHTML = '<option value="">Каталог временно недоступен</option>';
    }
  }

  // Экранируем текст из API перед вставкой в HTML.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  }

  function renderTours() {
  tourGrid.innerHTML = tours.map((tour, index) => `
    <article class="tour-card reveal">
      <div class="tour-visual" style="background:${palettes[index % palettes.length]}">
        <img
          class="tour-image"
          src="/static/img/${escapeHtml(tour.image || '')}"
          alt="${escapeHtml(tour.title)}"
        >
        
      </div>

      <div class="tour-body">
        <div class="tour-meta">
          <span>◷ ${escapeHtml(tour.duration)}</span>
          <span>Дагестан</span>
        </div>

        <h3>${escapeHtml(tour.title)}</h3>
        <p>${escapeHtml(tour.description)}</p>

        <div class="tour-foot">
          <div class="tour-price">
            ${money(tour.price)}
            <small>за человека</small>
          </div>
          <button class="tour-book" type="button" data-tour="${escapeHtml(tour.id)}">
            Забронировать ↗
          </button>
        </div>
      </div>
    </article>
  `).join("");

  observeReveals();
}

  tourGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-tour]");
    if (!button) return;
    tourSelect.value = button.dataset.tour;
    document.getElementById("booking").scrollIntoView({behavior: "smooth"});
    tourSelect.focus({preventScroll: true});
  });

  // Мобильная навигация закрывается после выбора якоря.
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");
  menuToggle.addEventListener("click", () => {
    const opened = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(opened));
  });
  mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  }));

  // Маска телефона +7 (999) 999-99-99.
  const phoneInput = document.getElementById("phoneInput");
  phoneInput.addEventListener("input", () => {
    let digits = phoneInput.value.replace(/\D/g, "");
    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (!digits.startsWith("7")) digits = "7" + digits;
    digits = digits.slice(0, 11);
    let result = "+7";
    if (digits.length > 1) result += " (" + digits.slice(1, 4);
    if (digits.length >= 4) result += ")";
    if (digits.length > 4) result += " " + digits.slice(4, 7);
    if (digits.length > 7) result += "-" + digits.slice(7, 9);
    if (digits.length > 9) result += "-" + digits.slice(9, 11);
    phoneInput.value = result;
  });

  // Минимальная дата — сегодня.
  const dateInput = document.getElementById("dateInput");
  const today = new Date();
  dateInput.min = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  bookingForm.addEventListener("submit", async event => {
    event.preventDefault();
    formMessage.className = "form-message";
    formMessage.textContent = "";
    bookingForm.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
    const formData = new FormData(bookingForm);
    const payload = Object.fromEntries(formData.entries());
    let valid = true;
    ["name", "phone", "tour_id", "date", "people", "consent"].forEach(name => {
      const input = bookingForm.elements[name];
      if (name === "consent") {
        if (!input.checked) { input.classList.add("invalid"); valid = false; }
      } else if (!String(payload[name] || "").trim()) { input.classList.add("invalid"); valid = false; }
    });
    if (String(payload.name).trim().length < 2) { bookingForm.elements.name.classList.add("invalid"); valid = false; }
    if (![10, 11].includes(payload.phone.replace(/\D/g, "").length)) { phoneInput.classList.add("invalid"); valid = false; }
    if (!valid) {
      formMessage.textContent = "Пожалуйста, заполните обязательные поля корректно.";
      formMessage.classList.add("error");
      return;
    }
    const submitButton = bookingForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Отправляем…";
    try {
      const response = await fetch("/book", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const message = result.errors ? Object.values(result.errors).join(" ") : (result.message || "Не удалось отправить заявку.");
        throw new Error(message);
      }
      formMessage.textContent = "✓ " + result.message;
      formMessage.classList.add("success");
      bookingForm.reset();
    } catch (error) {
      formMessage.textContent = error.message || "Ошибка соединения. Попробуйте ещё раз.";
      formMessage.classList.add("error");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Отправить заявку <span>→</span>';
    }
  });

  // Счётчики запускаются один раз, когда блок появляется на экране.
  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target, target = Number(el.dataset.target), suffix = el.dataset.suffix || "";
      const duration = 1500, start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        el.textContent = Math.round(target * eased).toLocaleString("ru-RU") + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      counterObserver.unobserve(el);
    });
  }, {threshold: .5});
  document.querySelectorAll(".counter").forEach(el => counterObserver.observe(el));

  // Плавное появление секций при прокрутке.
  let revealObserver;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
      return;
    }
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    }), {threshold: .12});
    document.querySelectorAll(".reveal:not(.visible)").forEach(el => revealObserver.observe(el));
  }
  observeReveals();

  // Галерея: открываем локальный визуальный лайтбокс без загрузки фотографий.
  const lightbox = document.getElementById("lightbox");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxArt = document.getElementById("lightboxArt");
  document.querySelectorAll(".gallery-tile").forEach(tile => tile.addEventListener("click", () => {
    lightboxTitle.textContent = tile.dataset.title;
    lightboxArt.style.background = getComputedStyle(tile).backgroundImage;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
  }));
  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
  }
  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", event => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeLightbox(); });

  // Отзывы: карусель с автопрокруткой, точками и стрелками.
  const track = document.getElementById("reviewTrack");
  const cards = Array.from(track.children);
  const dots = document.getElementById("reviewDots");
  let reviewIndex = 0, reviewTimer;
  function visibleCards() { return window.innerWidth <= 600 ? 1 : window.innerWidth <= 820 ? 2 : 3; }
  function maxReviewIndex() { return Math.max(0, cards.length - visibleCards()); }
  function drawReviews() {
    reviewIndex = Math.min(reviewIndex, maxReviewIndex());
    const gap = 18;
    const width = cards[0].getBoundingClientRect().width + gap;
    track.style.transform = `translateX(-${reviewIndex * width}px)`;
    dots.querySelectorAll("button").forEach((dot, index) => dot.classList.toggle("active", index === reviewIndex));
  }
  function buildDots() {
    dots.innerHTML = "";
    for (let i = 0; i <= maxReviewIndex(); i++) {
      const dot = document.createElement("button");
      dot.type = "button"; dot.setAttribute("aria-label", `Показать отзыв ${i+1}`);
      dot.addEventListener("click", () => { reviewIndex = i; drawReviews(); restartTimer(); });
      dots.appendChild(dot);
    }
    drawReviews();
  }
  function nextReview() { reviewIndex = reviewIndex >= maxReviewIndex() ? 0 : reviewIndex + 1; drawReviews(); }
  function restartTimer() { clearInterval(reviewTimer); reviewTimer = setInterval(nextReview, 5500); }
  document.getElementById("nextReview").addEventListener("click", () => { nextReview(); restartTimer(); });
  document.getElementById("prevReview").addEventListener("click", () => { reviewIndex = reviewIndex <= 0 ? maxReviewIndex() : reviewIndex - 1; drawReviews(); restartTimer(); });
  window.addEventListener("resize", buildDots);
  buildDots(); restartTimer();

  document.getElementById("currentYear").textContent = new Date().getFullYear();
  loadTours();
});
