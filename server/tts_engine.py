import os
import threading
import uuid
import re
from typing import Optional

class TTSEngine:
    """
    Very lightweight on-device TTS engine.
    Uses system SAPI5 / pyttsx3 or generates high-speed WAV audio files on-demand.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(TTSEngine, cls).__new__(cls)
                cls._instance._init_engine()
            return cls._instance

    def _init_engine(self):
        self.output_dir = os.path.join(os.path.dirname(__file__), "tts_cache")
        os.makedirs(self.output_dir, exist_ok=True)
        self.engine = None
        try:
            import pyttsx3
            self.engine = pyttsx3.init()
            self.engine.setProperty('rate', 175)  # Natural human reading speed
            print(" Local pyttsx3 offline TTS initialized.")
        except Exception as e:
            print(f"pyttsx3 init note: {e}")

    def speak_to_file(self, text: str) -> Optional[str]:
        """
        Synthesizes text into an offline local WAV file and returns the filename.
        """
        clean_text = re.sub(r'[^\w\s.,!?-]', '', text).strip()
        if not clean_text:
            return None
        
        filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
        file_path = os.path.join(self.output_dir, filename)
        
        try:
            if self.engine:
                with self._lock:
                    self.engine.save_to_file(clean_text, file_path)
                    self.engine.runAndWait()
                return filename
        except Exception as e:
            print(f"TTS synthesis error: {e}")
            
        return None

tts_service = TTSEngine()
