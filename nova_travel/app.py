import os
import smtplib
import ssl
from email.message import EmailMessage
from flask import Flask, render_template, request, jsonify
from pathlib import Path
from datetime import datetime
import json
import re
import sqlite3

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
BOOKINGS_FILE = BASE_DIR / "bookings.json"  # резервная совместимость со старыми версиями
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", str(BASE_DIR / "nova_travel.sqlite3")))
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024  # защита от чрезмерно больших запросов

# Каталог туров — единый источник данных для API и формы бронирования.
TOURS = [
    {"id": "sulak", "title": "Сулакский каньон", "duration": "1 день", "price": 4500,
     "description": "Бирюзовая вода, головокружительные панорамы и прогулка на катере.",
     "tag": "Хит продаж", "image": "sulak.png"},

    {"id": "dagestan-3", "title": "Дагестан за 3 дня", "duration": "3 дня / 2 ночи", "price": 18900,
     "description": "Главные природные и исторические места республики в одном маршруте.",
     "tag": "Бестселлер", "image": "mountains.png"},

    {"id": "gamsutl", "title": "Гамсутль и Гуниб", "duration": "1 день", "price": 5900,
     "description": "Атмосфера аула-призрака, горные дороги и история Дагестана.",
     "tag": "Горы", "image": "gamsutl.png"},

    {"id": "derbent", "title": "Дербент — древний город", "duration": "1 день", "price": 3900,
     "description": "Крепость Нарын-Кала, старинные улочки и Каспийское побережье.",
     "image": "derbent.png"},

    {"id": "sarykum", "title": "Бархан Сарыкум", "duration": "4–5 часов", "price": 3200,
     "description": "Песчаные дюны среди гор и необычные пейзажи заповедника.",
     "tag": "Природа", "image": "sarykum.png"},
        {
        "id": "goor",
        "title": "Гоор и Язык тролля",
        "duration": "1 день",
        "price": 5000,
        "description": "Путешествие к древним башням аула Гоор, захватывающие виды на горы и знаменитый скальный выступ «Язык тролля».",
        "tag": "Горы",
        "image": "goor.png"
    },
    
         {
        "id": "chechnya",
        "title": "Чечня: Шали, Аргун и Грозный",
        "duration": "1 день",
        "price": 5500,
        "description": "Мечети Шали и Аргуна, знакомство с Грозным и культурой Чечни.",
        "tag": "Новинка",
        "image": "chechnya.png"
    },
    {
        "id": "hunzakh",
        "title": "Хунзах — Каменная чаша",
        "duration": "1 день",
        "price": 4500,
        "description": "Живописные горные пейзажи, водопады и загадочная Каменная чаша.",
        "tag": "Горы",
        "image": "hunzakh.png"
    },
        {
        "id": "saltinskoe",
        "title": "Салтинское ущелье и водопад",
        "duration": "1 день",
        "price": 4000,
        "description": "Прогулка по живописному Салтинскому ущелью и знакомство с уникальным подземным водопадом.",
        "tag": "Природа",
        "image": "saltinskoe.png"
    },


]

def get_db():
    """Открывает локальную SQLite-базу; соединение закрывается после запроса."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_db() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                tour_id TEXT NOT NULL,
                tour_title TEXT NOT NULL,
                date TEXT NOT NULL,
                people INTEGER NOT NULL,
                promo TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                email_sent INTEGER NOT NULL DEFAULT 0,
                email_error TEXT NOT NULL DEFAULT ''
            )
        """)


def save_booking(booking):
    with get_db() as connection:
        connection.execute("""
            INSERT INTO bookings
            (id, created_at, name, phone, tour_id, tour_title, date, people, promo, comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (booking["id"], booking["created_at"], booking["name"], booking["phone"],
              booking["tour_id"], booking["tour_title"], booking["date"], booking["people"],
              booking["promo"], booking["comment"]))


def update_email_status(booking_id, sent, error=""):
    with get_db() as connection:
        connection.execute(
            "UPDATE bookings SET email_sent = ?, email_error = ? WHERE id = ?",
            (1 if sent else 0, error[:500], booking_id)
        )



def send_booking_email(booking):
    email_user = os.environ.get("MAIL_USERNAME", "nova_travel_ru@mail.ru")
    email_password = os.environ.get("MAIL_PASSWORD")
    receiver = os.environ.get("BOOKING_RECEIVER", "nova_travel_ru@mail.ru")

    if not email_password:
        raise RuntimeError("Не задан MAIL_PASSWORD")

    message = EmailMessage()
    message["Subject"] = f"Новая заявка Nova Travel — {booking['tour_title']}"
    message["From"] = email_user
    message["To"] = receiver

    message.set_content(
        f"""Новая заявка с сайта Nova Travel

Имя: {booking['name']}
Телефон: {booking['phone']}
Тур: {booking['tour_title']}
Дата поездки: {booking['date']}
Количество человек: {booking['people']}
Промокод: {booking['promo'] or 'Не указан'}
Комментарий: {booking['comment'] or 'Нет'}

Номер заявки: {booking['id']}
Дата получения: {booking['created_at']}
"""
    )

    context = ssl.create_default_context()

    with smtplib.SMTP_SSL("smtp.mail.ru", 465, context=context, timeout=20) as server:
        server.login(email_user, email_password)
        server.send_message(message)
@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/tours")
def api_tours():
    return jsonify({"tours": TOURS})

@app.post("/book")
def book():
    # Серверная проверка обязательна, даже если на странице есть JS-валидация.
    data = request.get_json(silent=True) or request.form.to_dict()
    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    tour_id = str(data.get("tour_id", "")).strip()
    date = str(data.get("date", "")).strip()
    people_raw = str(data.get("people", "")).strip()
    promo = str(data.get("promo", "")).strip()
    comment = str(data.get("comment", "")).strip()

    # Honeypot: скрытое поле для простейшей фильтрации автоматического спама.
    if str(data.get("website", "")).strip():
        return jsonify({"ok": True, "message": "Заявка принята."}), 201

    errors = {}
    if len(name) > 100:
        errors["name"] = "Имя слишком длинное. Максимум 100 символов."
    if len(phone) > 30:
        errors["phone"] = "Проверьте номер телефона."
    if len(promo) > 40:
        errors["promo"] = "Промокод слишком длинный."
    if len(comment) > 2000:
        errors["comment"] = "Комментарий не должен превышать 2000 символов."
    if len(name) < 2:
        errors["name"] = "Укажите имя (не менее 2 символов)."
    digits = re.sub(r"\D", "", phone)
    if len(digits) not in (10, 11):
        errors["phone"] = "Укажите корректный номер телефона."
    if tour_id not in {tour["id"] for tour in TOURS}:
        errors["tour_id"] = "Выберите тур из списка."
    try:
        people = int(people_raw)
        if not 1 <= people <= 20:
            raise ValueError
    except (TypeError, ValueError):
        people = 0
        errors["people"] = "Количество человек должно быть от 1 до 20."
    try:
        selected_date = datetime.strptime(date, "%Y-%m-%d").date()
        if selected_date < datetime.now().date():
            errors["date"] = "Дата не может быть в прошлом."
    except ValueError:
        errors["date"] = "Укажите дату поездки."

    if errors:
        return jsonify({"ok": False, "message": "Проверьте заполнение формы.", "errors": errors}), 400

    selected_tour = next(tour for tour in TOURS if tour["id"] == tour_id)
    booking = {
        "id": datetime.now().strftime("%Y%m%d%H%M%S%f"),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "name": name, "phone": phone, "tour_id": tour_id,
        "tour_title": selected_tour["title"], "date": date,
        "people": people, "promo": promo, "comment": comment
    }

    # Сначала надёжно сохраняем заявку. Ошибка почты не должна терять обращение клиента.
    try:
        save_booking(booking)
    except sqlite3.Error:
        app.logger.exception("Не удалось сохранить заявку в SQLite")
        return jsonify({"ok": False, "message": "Не удалось сохранить заявку. Попробуйте позже."}), 500

    email_sent = False
    try:
        send_booking_email(booking)
        email_sent = True
        update_email_status(booking["id"], True)
    except Exception as exc:
        app.logger.exception("Заявка сохранена, но письмо не отправлено")
        update_email_status(booking["id"], False, str(exc))

    return jsonify({
        "ok": True,
        "message": "Заявка принята. Мы свяжемся с вами в ближайшее время." if email_sent else
                   "Заявка сохранена. Если письмо не дошло, менеджер всё равно сможет обработать обращение.",
        "booking_id": booking["id"],
        "email_sent": email_sent
    }), 201

init_db()

if __name__ == "__main__":
    # debug=True удобно при локальной разработке; для публикации отключите debug.
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=False)
