import os
import re
from PIL import Image
import pypdf

def extract_text_from_file(file_path: str, filename: str) -> str:
    """
    Extracts text from PDF or images using OCR/parsers.
    """
    ext = os.path.splitext(filename)[1].lower()
    extracted_text = ""
    
    if ext == ".pdf":
        try:
            reader = pypdf.PdfReader(file_path)
            pages_text = []
            for idx, page in enumerate(reader.pages):
                txt = page.extract_text() or ""
                if txt.strip():
                    pages_text.append(f"[Page {idx+1}]\n{txt}")
            extracted_text = "\n\n".join(pages_text)
        except Exception as e:
            print(f"PDF extraction error for {filename}: {e}")
            
    elif ext in [".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tiff"]:
        try:
            import pytesseract
            # Try pytesseract if tesseract is installed in PATH
            img = Image.open(file_path)
            extracted_text = pytesseract.image_to_string(img)
        except Exception as e:
            # Fallback info if binary not in system PATH
            extracted_text = f"Image file: {filename}. Dimensions: {Image.open(file_path).size if os.path.exists(file_path) else 'N/A'}"
    else:
        # Plain text, markdown, csv, json
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                extracted_text = f.read()
        except Exception as e:
            extracted_text = f"Binary or unreadable file: {filename}"
            
    return extracted_text.strip()

def generate_summary(text: str, filename: str, max_sentences: int = 3) -> str:
    """
    Ultra-fast offline text summarization engine using extractive heuristic & frequency scoring.
    """
    if not text or len(text.strip()) == 0:
        return f"File {filename} uploaded without readable text."
    
    clean_text = text.replace("\r", " ").replace("\n", " ")
    sentences = re.split(r'(?<=[.!?]) +', clean_text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 15]
    
    if not sentences:
        return text[:200] + ("..." if len(text) > 200 else "")
    
    # Simple keyword frequency based ranking for compact summarization
    words = re.findall(r'\w+', clean_text.lower())
    freq = {}
    stopwords = {"the", "is", "at", "which", "on", "and", "a", "an", "in", "to", "for", "of", "or", "by", "with", "this", "that"}
    for w in words:
        if w not in stopwords and len(w) > 2:
            freq[w] = freq.get(w, 0) + 1
            
    scored_sentences = []
    for s in sentences:
        score = sum(freq.get(w.lower(), 0) for w in re.findall(r'\w+', s))
        scored_sentences.append((score, s))
        
    scored_sentences.sort(key=lambda x: x[0], reverse=True)
    top_sentences = [s for _, s in scored_sentences[:max_sentences]]
    
    return " ".join(top_sentences)
