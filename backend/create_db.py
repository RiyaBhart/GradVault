import os
import sys
from urllib.parse import urlparse
import psycopg2
from dotenv import load_dotenv

# Load env variables from backend/.env
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("Error: DATABASE_URL not found in backend/.env")
    sys.exit(1)

# Parse URL
result = urlparse(db_url)
username = result.username or "postgres"
password = result.password or "postgres"
host = result.hostname or "localhost"
port = result.port or 5432
dbname = result.path.lstrip("/") or "gradvault"

# Connect to the default 'postgres' database first to create the new database
try:
    print(f"Connecting to PostgreSQL at {host}:{port} as user '{username}'...")
    conn = psycopg2.connect(
        dbname="postgres",
        user=username,
        password=password,
        host=host,
        port=port
    )
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Check if database exists
    cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{dbname}';")
    exists = cursor.fetchone()
    if exists:
        print(f"Database '{dbname}' already exists.")
    else:
        cursor.execute(f"CREATE DATABASE {dbname};")
        print(f"Database '{dbname}' successfully created!")
    
    cursor.close()
    conn.close()
except Exception as e:
    print("\n--- Connection Error ---")
    print(e)
    print("\nPlease verify that:")
    print("1. PostgreSQL is installed and running on your system.")
    print("2. The username and password in backend/.env are correct.")
    sys.exit(1)
