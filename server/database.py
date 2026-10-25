import os
from pymongo import MongoClient
import certifi

MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://goparajukarthik2_db_user:2iHoHA5Isf2GQcsv@cluster0.kjbu3wm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
)

client = None
db = None

def get_database():
    global client, db
    if db is None:
        try:
            # Use certifi for secure SSL/TLS connection on Windows
            client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
            db = client["ai_work_os"]
            # Trigger connection check
            client.admin.command('ping')
            print(" Connected successfully to MongoDB Atlas!")
        except Exception as e:
            print(f"⚠️ Primary MongoDB connection failed: {e}. Fallback to direct connection without SSL verification...")
            try:
                client = MongoClient(MONGODB_URI, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=5000)
                db = client["ai_work_os"]
                client.admin.command('ping')
                print(" Connected to MongoDB with tlsAllowInvalidCertificates=True!")
            except Exception as e2:
                print(f"❌ MongoDB connection error: {e2}")
                raise e2
    return db
