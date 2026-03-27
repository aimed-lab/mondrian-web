"""
Mondrian Map - Flask API Server.

Serves the data processing pipeline as a REST API for the React frontend.

Usage (from the mmweb/python directory, with venv activated):
    python server.py

The React dev server (Vite) proxies /api/* to this server on port 5001.
"""

import json
import os
import sys
import traceback

from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(__file__))

from process_pipeline import run_pipeline

app = Flask(__name__)
CORS(app)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Mondrian Map pipeline server is running"})


@app.route("/api/process", methods=["POST"])
def process():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        up_genes = data.get("up_genes", [])
        down_genes = data.get("down_genes", [])

        # Validate
        if not up_genes and not down_genes:
            return jsonify({"error": "At least one of up_genes or down_genes must be provided"}), 400
        if len(up_genes) < 5 and len(down_genes) < 5:
            return jsonify({"error": f"Gene lists too short. Need at least 5 genes (got up={len(up_genes)}, down={len(down_genes)})"}), 400

        # Metadata
        case_study  = data.get("case_study", "Custom Analysis")
        tissue      = data.get("tissue_or_cell", "")
        contrast    = data.get("contrast", "")

        # Pipeline parameters
        library          = data.get("library", "GO_Biological_Process_2023")
        cutoff           = float(data.get("cutoff", 0.05))
        jaccard          = float(data.get("jaccard_threshold", 0.15))
        enrichment_mode  = data.get("enrichment_mode", "auto")
        embedding_mode   = data.get("embedding_mode", "auto")
        layout_mode      = data.get("layout_mode", "auto")

        result = run_pipeline(
            up_genes=up_genes,
            down_genes=down_genes,
            case_study=case_study,
            tissue_or_cell=tissue,
            contrast=contrast,
            enrichment_library=library,
            enrichment_cutoff=cutoff,
            jaccard_threshold=jaccard,
            enrichment_mode=enrichment_mode,
            embedding_mode=embedding_mode,
            layout_mode=layout_mode,
        )

        if result is None:
            return jsonify({"error": "No significant GO terms found for the provided gene list. Try lowering the p-value cutoff or providing a larger gene set."}), 404

        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("=" * 50)
    print("Mondrian Map Pipeline Server")
    print("Running at: http://localhost:5001")
    print("=" * 50)
    app.run(debug=True, port=5001, host="0.0.0.0")
