import os.path
import base64
import re
from datetime import datetime, timezone
from email import message_from_bytes
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# If modifying scopes, delete token.json file to re-authenticate
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

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

def get_latest_message_from_sender_today(service, sender_email, user_id="me"):
    query = f"from:{sender_email}"
    results = (
        service.users()
        .messages()
        .list(userId=user_id, q=query, maxResults=5)
        .execute()
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
        message_date = datetime.fromtimestamp(internal_date, tz=timezone.utc).astimezone()
        today = datetime.now().astimezone()

        # Check if email is from today
        if message_date.date() == today.date():
            payload = message.get("payload", {})
            headers = payload.get("headers", [])
            subject = snippet = None
            for header in headers:
                if header["name"] == "Subject":
                    subject = header["value"]
                    break
            snippet = message.get("snippet", "")
            return subject, snippet

    return None

def extract_otp(snippet):
    match = re.search(r"\b\d{6}\b", snippet)
    return match.group(0) if match else None

def main():
    creds = authenticate_gmail()
    service = build("gmail", "v1", credentials=creds)

    sender_email = "ezone@shardauniversity.com"
    print(f"Fetching latest email from {sender_email}...\n")

    result = get_latest_message_from_sender_today(service, sender_email)

    if not result:
        print("No recent email found from the specified sender today.")
    else:
        subject, snippet = result
        otp = extract_otp(snippet)

        print(f"Subject: {subject}")
        print(f"Snippet: {snippet}")
        print(f"Extracted OTP: {otp}")
        print("-" * 50)

if __name__ == "__main__":
    main()