import os
import re
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
GMAIL_SENDER = "ezone@shardauniversity.com"


def authenticate_gmail():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                "express-backend/middleware/credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)
        with open("token.json", "w") as token:
            token.write(creds.to_json())
    return creds


def get_latest_otp_from_sender(service, sender_email, user_id="me"):
    query = f"from:{sender_email}"
    results = (
        service.users().messages().list(userId=user_id, q=query, maxResults=5).execute()
    )
    messages = results.get("messages", [])
    if not messages:
        return None

    for msg in messages:
        message = (
            service.users()
            .messages()
            .get(userId=user_id, id=msg["id"], format="full")
            .execute()
        )
        internal_date = int(message.get("internalDate")) / 1000
        message_date = datetime.fromtimestamp(
            internal_date, tz=timezone.utc
        ).astimezone()
        if message_date.date() == datetime.now().astimezone().date():
            snippet = message.get("snippet", "")
            match = re.search(r"\b\d{6}\b", snippet)
            return match.group(0) if match else None
    return None


def fetch_attendance(sys_id, otp):
    session = requests.Session()
    initial_url = "https://student.sharda.ac.in/admin"
    session.get(initial_url)  # Get initial cookies

    # STEP 1: Send OTP request
    otp_url = "https://student.sharda.ac.in/studentlogin/sendotp"
    otp_headers = {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "origin": "https://student.sharda.ac.in",
        "referer": "https://student.sharda.ac.in/admin",
        "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
    }
    otp_data = {"send_otp": "1", "system_id": sys_id, "mode": "1"}
    otp_response = session.post(otp_url, headers=otp_headers, data=otp_data)
    print("OTP sent, fetching from Gmail...")

    # STEP 2: Fetch OTP from Gmail
    creds = authenticate_gmail()
    service = build("gmail", "v1", credentials=creds)
    otp = get_latest_otp_from_sender(service, GMAIL_SENDER)

    if not otp:
        print("Could not retrieve OTP from email.")
        return

    print(f"Retrieved OTP: {otp}")

    # STEP 3: Login using OTP
    login_url = "https://student.sharda.ac.in/admin"
    login_headers = {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://student.sharda.ac.in",
        "referer": "https://student.sharda.ac.in/admin",
        "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    }
    login_data = {"system_id": sys_id, "otp": otp}
    login_response = session.post(login_url, headers=login_headers, data=login_data)

    # STEP 4: Scrape attendance
    attendance_url = "https://student.sharda.ac.in/admin/courses"
    attendance_headers = {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "referer": "https://student.sharda.ac.in/admin/home",
        "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    }
    response = session.get(attendance_url, headers=attendance_headers)
    soup = BeautifulSoup(response.text, "html.parser")

    table = soup.find("table", id="table1")
    if table:
        rows = table.find_all("tr")
        headers = [th.get_text(strip=True) for th in rows[1].find_all("th")]
        data = []
        for row in rows[2:]:
            cols = row.find_all("td")
            if len(cols) == len(headers):
                data.append([col.get_text(strip=True) for col in cols])
        df = pd.DataFrame(data, columns=headers)
        print("\nAttendance Table:")
        print(df)
    else:
        print("Attendance table not found.")


if __name__ == "__main__":
    system_id = input("Enter your system ID: ")
    fetch_attendance(system_id, otp=None)