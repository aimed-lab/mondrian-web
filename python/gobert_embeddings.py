"""
GoBERT Embedding Extraction Module for Mondrian Map Pipeline.

Two modes:
  1. Full mode: Uses HuggingFace transformers + torch (production)
  2. Fallback mode: Uses deterministic hash-based embeddings (no GPU needed)
"""

import hashlib

import numpy as np


# ── Constants ──────────────────────────────────────────────────────────────

GOBERT_REPO = "MM-YY-WW/GoBERT"
GOBERT_DIM = 1024  # GoBERT hidden size — single source of truth


# ── Mode 1: Full GoBERT (requires torch + transformers) ──────────────────

def get_gobert_embeddings_full(go_ids, batch_size=512):
    """
    Extract embeddings from the GoBERT model for given GO terms.
    Processes in batches to handle any number of GO terms.

    Args:
        go_ids: List of GO IDs without prefix (e.g., ["0006955", "0002250"])
        batch_size: Number of tokens per forward pass (default 512)

    Returns:
        dict: {go_id: np.ndarray} mapping GO IDs to their embeddings
    """
    import torch
    from transformers import BertForPreTraining
    from huggingface_hub import hf_hub_download

    # Build token -> id map from vocab.txt
    vocab_path = hf_hub_download(GOBERT_REPO, "vocab.txt")
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

    if len(go_terms_in_vocab) >= 1:
        # Load model once
        print(f"  Loading GoBERT model weights...")
        model = BertForPreTraining.from_pretrained(GOBERT_REPO)
        model.eval()

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)
        print(f"  Using device: {device}")

        # Process in batches
        for batch_start in range(0, len(go_terms_in_vocab), batch_size):
            batch = go_terms_in_vocab[batch_start:batch_start + batch_size]
            input_ids = [token2id[t] for t in batch]
            attention_mask = [1] * len(input_ids)

            input_tensor = torch.tensor([input_ids]).to(device)
            mask_tensor = torch.tensor([attention_mask]).to(device)

            with torch.no_grad():
                outputs = model(
                    input_ids=input_tensor,
                    attention_mask=mask_tensor,
                    output_hidden_states=True,
                )
                hidden = outputs.hidden_states[-1].squeeze(0).cpu().numpy()

            for i, go_term in enumerate(batch):
                go_id = go_term.replace("GO:", "")
                go_id_to_embedding[go_id] = np.asarray(hidden[i], dtype=np.float32).flatten()

            done = min(batch_start + batch_size, len(go_terms_in_vocab))
            print(f"    Embedded {done}/{len(go_terms_in_vocab)} terms...")

        # Print actual dimension from model output
        sample_dim = next(iter(go_id_to_embedding.values())).shape[0]
        print(f"  GoBERT embedding dimension: {sample_dim}")

        del model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    else:
        print("  [WARN] No GO terms found in GoBERT vocab.")

    # Add fallback embeddings for missing terms (using model's actual dimension)
    actual_dim = GOBERT_DIM
    if go_id_to_embedding:
        actual_dim = next(iter(go_id_to_embedding.values())).shape[0]

    for go_term in go_terms_missing:
        go_id = go_term.replace("GO:", "")
        go_id_to_embedding[go_id] = _hash_embedding(go_id, dim=actual_dim)

    return go_id_to_embedding


# ── Mode 2: Fallback hash-based embeddings (no GPU needed) ──────────────

def _hash_embedding(go_id, dim=GOBERT_DIM):
    """
    Generate a deterministic pseudo-embedding from a GO ID using hashing.
    Produces consistent results across runs for the same GO ID.
    """
    hash_bytes = hashlib.sha256(f"GO:{go_id}".encode()).digest()
    seed = int.from_bytes(hash_bytes[:4], "big")
    rng = np.random.RandomState(seed)
    embedding = rng.randn(dim).astype(np.float32)
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding


def get_gobert_embeddings_fallback(go_ids, dim=GOBERT_DIM):
    """
    Generate deterministic hash-based embeddings for GO terms.

    Args:
        go_ids: List of GO IDs without prefix
        dim: Embedding dimension

    Returns:
        dict: {go_id: np.ndarray(dim,)}
    """
    return {go_id: _hash_embedding(go_id, dim=dim) for go_id in go_ids}


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
