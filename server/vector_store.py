import os
import numpy as np
import faiss
import pickle
import threading
from typing import List, Dict, Any

class VectorIndexManager:
    """
    Manages local FAISS vector index and metadata mapping.
    Uses sentence-transformers or lightweight fallback embedding.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(VectorIndexManager, cls).__new__(cls)
                cls._instance._init_index()
            return cls._instance

    def _init_index(self):
        self.dimension = 384  # Default embedding size for all-MiniLM-L6-v2 / lightweight local SLM
        self.index_path = os.path.join(os.path.dirname(__file__), "faiss.index")
        self.metadata_path = os.path.join(os.path.dirname(__file__), "metadata.pkl")
        self.model = None
        
        # Load or initialize FAISS index
        if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
            try:
                self.index = faiss.read_index(self.index_path)
                with open(self.metadata_path, "rb") as f:
                    self.metadata = pickle.load(f)
                print(f" Loaded FAISS index with {self.index.ntotal} vectors.")
            except Exception as e:
                print(f"Failed loading FAISS index, creating new: {e}")
                self.index = faiss.IndexFlatIP(self.dimension)
                self.metadata = []
        else:
            self.index = faiss.IndexFlatIP(self.dimension)
            self.metadata = []

    def _get_embedding_model(self):
        if self.model is None:
            try:
                from sentence_transformers import SentenceTransformer
                # Gemma / all-MiniLM lightweight local embedder
                self.model = SentenceTransformer("all-MiniLM-L6-v2")
                print(" SentenceTransformer embedder initialized.")
            except Exception as e:
                print(f"SentenceTransformer not ready yet: {e}")
        return self.model

    def get_embedding(self, text: str) -> np.ndarray:
        model = self._get_embedding_model()
        if model is not None:
            vec = model.encode([text], convert_to_numpy=True)[0]
        else:
            # Deterministic lightweight hash-based vector fallback for instant offline bootstrap
            vec = np.zeros(self.dimension, dtype="float32")
            for i, word in enumerate(text.lower().split()):
                h = hash(word) % self.dimension
                vec[h] += 1.0 / (i + 1)
        # Normalize for Inner Product (Cosine similarity)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.astype("float32")

    def add_document(self, doc_id: str, text: str, meta: Dict[str, Any]):
        vec = self.get_embedding(text)
        vec_2d = np.expand_dims(vec, axis=0)
        self.index.add(vec_2d)
        
        item_meta = {
            "id": doc_id,
            "text": text,
            "meta": meta,
            "index_pos": self.index.ntotal - 1
        }
        self.metadata.append(item_meta)
        self.save()

    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if self.index.ntotal == 0:
            return []
        
        q_vec = self.get_embedding(query)
        q_2d = np.expand_dims(q_vec, axis=0)
        top_k = min(top_k, self.index.ntotal)
        distances, indices = self.index.search(q_2d, top_k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if 0 <= idx < len(self.metadata):
                res = dict(self.metadata[idx])
                res["similarity_score"] = float(dist)
                results.append(res)
        return results

    def save(self):
        try:
            faiss.write_index(self.index, self.index_path)
            with open(self.metadata_path, "wb") as f:
                pickle.dump(self.metadata, f)
        except Exception as e:
            print(f"Error saving FAISS index: {e}")

vector_manager = VectorIndexManager()
