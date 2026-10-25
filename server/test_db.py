import certifi
from pymongo import MongoClient

URI = "mongodb+srv://goparajukarthik2_db_user:2iHoHA5Isf2GQcsv@cluster0.kjbu3wm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

print("Connecting to MongoDB Atlas...")
try:
    client = MongoClient(URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
    db = client["ai_work_os"]
    client.admin.command('ping')
    print("SUCCESS: Connected to MongoDB Atlas with certifi CA!")
except Exception as e:
    print(f"Direct CA error: {e}. Trying tlsAllowInvalidCertificates=True...")
    try:
        client = MongoClient(URI, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=5000)
        db = client["ai_work_os"]
        client.admin.command('ping')
        print("SUCCESS: Connected to MongoDB Atlas with tlsAllowInvalidCertificates=True!")
    except Exception as e2:
        print(f"FAILED: {e2}")
