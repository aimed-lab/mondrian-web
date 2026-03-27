"""
Enrichment Analysis Module for Mondrian Map Pipeline.

Two modes:
  1. Full mode: Uses gseapy.enrichr() (requires gseapy installed)
  2. REST mode: Calls Enrichr REST API directly (only requires requests)

Both return the same DataFrame format.
"""

import json
import re
import time

import pandas as pd

# --- Mode 1: gseapy-based enrichment ---

def run_enrichment_gseapy(gene_list, library="GO_Biological_Process_2023", cutoff=0.05):
    """
    Run Enrichr enrichment analysis via gseapy.

    Args:
        gene_list: List of gene symbols
        library: Enrichr gene set library name
        cutoff: Adjusted p-value cutoff (default 0.05)

    Returns:
        pd.DataFrame with enrichment results
    """
    import gseapy as gp

    if len(gene_list) < 5:
        print(f"  [SKIP] Gene list too short ({len(gene_list)} genes)")
        return pd.DataFrame()

    try:
        enr = gp.enrichr(
            gene_list=gene_list,
            gene_sets=library,
            organism="human",
            outdir=None,
            no_plot=True,
            cutoff=1.0,  # Get all results, filter later
        )

        df = enr.results
        if df.empty:
            return df

        # Filter by significance
        df = df[df["Adjusted P-value"] < cutoff].copy()
        return df

    except Exception as e:
        print(f"  [ERROR] Enrichment failed: {e}")
        return pd.DataFrame()


# --- Mode 2: Enrichr REST API-based enrichment ---

def run_enrichment_rest(gene_list, library="GO_Biological_Process_2023", cutoff=0.05):
    """
    Run Enrichr enrichment analysis via REST API (no gseapy needed).

    Args:
        gene_list: List of gene symbols
        library: Enrichr gene set library name
        cutoff: Adjusted p-value cutoff

    Returns:
        pd.DataFrame with enrichment results matching gseapy format
    """
    import requests

    if len(gene_list) < 5:
        print(f"  [SKIP] Gene list too short ({len(gene_list)} genes)")
        return pd.DataFrame()

    base_url = "https://maayanlab.cloud/Enrichr"

    try:
        # Step 1: Submit gene list
        genes_str = "\n".join(gene_list)
        payload = {"list": (None, genes_str), "description": (None, "mondrian_map")}
        response = requests.post(f"{base_url}/addList", files=payload, timeout=30)
        if response.status_code != 200:
            print(f"  [ERROR] Failed to submit gene list: {response.status_code}")
            return pd.DataFrame()

        data = response.json()
        user_list_id = data.get("userListId")
        if not user_list_id:
            print(f"  [ERROR] No userListId returned")
            return pd.DataFrame()

        # Step 2: Get enrichment results
        time.sleep(1)  # Brief pause to let server process
        enrich_url = f"{base_url}/enrich?userListId={user_list_id}&backgroundType={library}"
        response = requests.get(enrich_url, timeout=60)
        if response.status_code != 200:
            print(f"  [ERROR] Failed to get enrichment results: {response.status_code}")
            return pd.DataFrame()

        results = response.json()
        enrichment_data = results.get(library, [])

        if not enrichment_data:
            print(f"  [WARN] No enrichment results for {library}")
            return pd.DataFrame()

        # Parse into DataFrame
        # Enrichr API returns: [rank, term_name, p-value, z-score, combined_score,
        #                        overlapping_genes, adjusted_p_value, old_p_value,
        #                        old_adjusted_p_value]
        rows = []
        for entry in enrichment_data:
            term_name = entry[1]
            p_value = entry[2]
            z_score = entry[3]
            combined_score = entry[4]
            genes = entry[5]
            adj_p_value = entry[6]

            # Parse GO ID from term name (e.g., "immune response (GO:0006955)")
            go_id_match = re.search(r"\(GO:(\d+)\)", term_name)
            go_id = go_id_match.group(1) if go_id_match else ""
            clean_name = re.sub(r"\s*\(GO:\d+\)", "", term_name).strip()

            # Calculate overlap
            overlap_str = f"{len(genes)}/{len(gene_list)}"

            rows.append({
                "Gene_set": library,
                "Term": term_name,
                "GO_ID": go_id,
                "Clean_Name": clean_name,
                "Overlap": overlap_str,
                "P-value": p_value,
                "Adjusted P-value": adj_p_value,
                "Z-score": z_score,
                "Combined Score": combined_score,
                "Genes": ";".join(genes) if isinstance(genes, list) else str(genes),
                "Gene_Count": len(genes) if isinstance(genes, list) else 0,
            })

        df = pd.DataFrame(rows)

        # Filter by significance
        df = df[df["Adjusted P-value"] < cutoff].copy()
        df = df.sort_values("Adjusted P-value").reset_index(drop=True)

        return df

    except requests.exceptions.ConnectionError:
        print("  [ERROR] Cannot connect to Enrichr API. Check internet connection.")
        return pd.DataFrame()
    except Exception as e:
        print(f"  [ERROR] REST enrichment failed: {e}")
        return pd.DataFrame()


def run_enrichment(gene_list, library="GO_Biological_Process_2023", cutoff=0.05, mode="auto"):
    """
    Run enrichment analysis with automatic fallback.

    Args:
        gene_list: List of gene symbols
        library: Enrichr gene set library
        cutoff: Adjusted p-value cutoff
        mode: 'gseapy', 'rest', or 'auto' (try gseapy first, fallback to REST)

    Returns:
        pd.DataFrame with enrichment results
    """
    if mode == "gseapy":
        return run_enrichment_gseapy(gene_list, library, cutoff)
    elif mode == "rest":
        return run_enrichment_rest(gene_list, library, cutoff)
    else:
        # Auto: try gseapy, fallback to REST
        try:
            import gseapy
            print("  Using gseapy for enrichment...")
            return run_enrichment_gseapy(gene_list, library, cutoff)
        except ImportError:
            print("  gseapy not available, using REST API...")
            return run_enrichment_rest(gene_list, library, cutoff)


def parse_enrichment_results(df, direction="upregulated"):
    """
    Parse enrichment DataFrame into a standardized list of GO term dicts.

    Args:
        df: Enrichment results DataFrame
        direction: 'upregulated', 'downregulated', or 'shared'

    Returns:
        list[dict]: Standardized GO term information
    """
    results = []

    for _, row in df.iterrows():
        # Parse GO ID from Term field
        term = str(row.get("Term", ""))
        go_id_match = re.search(r"GO:(\d+)", term)

        if row.get("GO_ID"):
            go_id = str(row["GO_ID"])
        elif go_id_match:
            go_id = go_id_match.group(1)
        else:
            continue

        # Parse gene list
        genes_str = str(row.get("Genes", ""))
        if ";" in genes_str:
            genes = [g.strip() for g in genes_str.split(";") if g.strip()]
        else:
            genes = [g.strip() for g in genes_str.split(",") if g.strip()]

        # Clean name
        name = row.get("Clean_Name", "")
        if not name:
            name = re.sub(r"\s*\(GO:\d+\)", "", term).strip()

        adj_p = float(row.get("Adjusted P-value", 1.0))
        significance_score = -1 * __import__("math").log10(max(adj_p, 1e-300))

        results.append({
            "go_id": go_id,
            "name": name,
            "direction": direction,
            "adjusted_p_value": adj_p,
            "significance_score": round(significance_score, 4),
            "gene_count": int(row.get("Gene_Count", len(genes))),
            "genes": genes,
            "p_value": float(row.get("P-value", adj_p)),
            "combined_score": float(row.get("Combined Score", 0)),
        })

    return results
