"""
GoBERT Embedding Extraction Module for Mondrian Map Pipeline.

Two modes:
  1. Full mode: Uses HuggingFace transformers + torch (production)
  2. Fallback mode: Uses deterministic hash-based embeddings (no GPU needed)
"""

import hashlib
import re

import numpy as np


# --- Mode 1: Full GoBERT (requires torch + transformers) ---

def get_gobert_embeddings_full(go_ids):
    """
    Extract embeddings from the GoBERT model for given GO terms.

    Args:
        go_ids: List of GO IDs without prefix (e.g., ["0006955", "0002250"])

    Returns:
        dict: {go_id: np.ndarray(768,)} mapping GO IDs to their embeddings
    """
    import torch
    from transformers import BertForPreTraining
    from huggingface_hub import hf_hub_download

    repo_name = "MM-YY-WW/GoBERT"

    # Build token -> id map from vocab.txt
    vocab_path = hf_hub_download(repo_name, "vocab.txt")
    with open(vocab_path, "r") as f:
        vocab_tokens = [line.strip() for line in f if line.strip()]
    token2id = {tok: idx for idx, tok in enumerate(vocab_tokens)}

    # Format GO terms with prefix
    go_terms = [f"GO:{gid}" for gid in go_ids]

    # Filter to only terms in GoBERT vocabulary
    go_terms_in_vocab = [t for t in go_terms if t in token2id]
    go_terms_missing = [t for t in go_terms if t not in token2id]

    if go_terms_missing:
        print(f"  [INFO] {len(go_terms_missing)} GO terms not in GoBERT vocab (will use fallback)")

    go_id_to_embedding = {}

    if len(go_terms_in_vocab) >= 2:
        input_ids = [token2id[t] for t in go_terms_in_vocab]
        attention_mask = [1] * len(input_ids)

        input_tensor = torch.tensor([input_ids])
        attention_mask_tensor = torch.tensor([attention_mask])

        # Load model and extract embeddings
        model = BertForPreTraining.from_pretrained(repo_name)
        model.eval()

        with torch.no_grad():
            outputs = model(
                input_ids=input_tensor,
                attention_mask=attention_mask_tensor,
                output_hidden_states=True,
            )
            embedding = outputs.hidden_states[-1].squeeze(0).cpu().numpy()

        print(f"  GoBERT embeddings shape: {embedding.shape}")

        # Map embeddings back to GO IDs
        for i, go_term in enumerate(go_terms_in_vocab):
            go_id = go_term.replace("GO:", "")
            go_id_to_embedding[go_id] = embedding[i]
    else:
        print("  [WARN] Too few GO terms in GoBERT vocab.")

    # Add fallback embeddings for missing terms
    for go_term in go_terms_missing:
        go_id = go_term.replace("GO:", "")
        go_id_to_embedding[go_id] = _hash_embedding(go_id, dim=768)

    return go_id_to_embedding


# --- Mode 2: Fallback hash-based embeddings (no GPU needed) ---

def _hash_embedding(go_id, dim=128):
    """
    Generate a deterministic pseudo-embedding from a GO ID using hashing.
    Produces consistent results across runs for the same GO ID.
    """
    # Use SHA-256 to generate deterministic bytes
    hash_bytes = hashlib.sha256(f"GO:{go_id}".encode()).digest()

    # Seed numpy RNG with hash for reproducibility
    seed = int.from_bytes(hash_bytes[:4], "big")
    rng = np.random.RandomState(seed)

    # Generate embedding vector
    embedding = rng.randn(dim).astype(np.float32)

    # Normalize to unit length
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm

    return embedding


def get_gobert_embeddings_fallback(go_ids, dim=128):
    """
    Generate deterministic hash-based embeddings for GO terms.
    Uses GO ID hashing + significance-aware perturbation.

    Args:
        go_ids: List of GO IDs without prefix
        dim: Embedding dimension (default 128)

    Returns:
        dict: {go_id: np.ndarray(dim,)}
    """
    go_id_to_embedding = {}
    for go_id in go_ids:
        go_id_to_embedding[go_id] = _hash_embedding(go_id, dim=dim)

    return go_id_to_embedding


def get_gobert_embeddings(go_ids, mode="auto"):
    """
    Get embeddings for GO terms with automatic fallback.

    Args:
        go_ids: List of GO IDs without prefix
        mode: 'full', 'fallback', or 'auto'

    Returns:
        dict: {go_id: np.ndarray}
    """
    if mode == "full":
        return get_gobert_embeddings_full(go_ids)
    elif mode == "fallback":
        return get_gobert_embeddings_fallback(go_ids)
    else:
        # Auto: try full, fallback to hash
        try:
            import torch
            from transformers import BertForPreTraining
            print("  Using GoBERT model for embeddings...")
            return get_gobert_embeddings_full(go_ids)
        except ImportError:
            print("  torch/transformers not available, using hash-based fallback embeddings...")
            return get_gobert_embeddings_fallback(go_ids)
