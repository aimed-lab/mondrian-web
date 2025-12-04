# Mondrian Map

**Mondrian Map** is a bioinformatics visualization tool inspired by the abstract art of Piet Mondrian. It visualizes differential pathway analysis data using a strict grid-based layout, primary colors, and orthogonal lines to represent biological entities and their relationships.

## Features

*   **Mondrian Aesthetic**: Strict 1000x1000 grid layout with 10px cells.
*   **Data Visualization**:
    *   **Entities**: Represented as rectangles. Size is proportional to Fold Change.
    *   **Coloring**:
        *   **Red**: Up-regulated (Fold Change ≥ 1.25, p < 0.05)
        *   **Blue**: Down-regulated (Fold Change ≤ 0.75, p < 0.05)
        *   **Yellow**: Significant but neutral fold change (0.75 < FC < 1.25, p < 0.05)
        *   **Black**: Insignificant (p ≥ 0.05)
    *   **Relationships**: Orthogonal lines connecting entities.
*   **Interactive**: Tooltips for entities and relationships.
*   **Data Upload**: Upload your own CSV files for Entities and Relationships.
*   **Export**: Download the visualization as a high-resolution PNG.
*   **Sample Data**: Generate synthetic data or download sample CSVs to get started.

## Setup & Installation

Follow these steps to set up the project locally.

### Prerequisites

*   **Node.js**: Ensure you have Node.js installed (version 16 or higher recommended).
*   **npm**: Comes with Node.js.

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/aimed-lab/mondrian-web.git
    cd mondrian-web
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Application

To start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is busy).

### Building for Production

To create a production-ready build:

```bash
npm run build
```

The output will be in the `dist` directory, ready for deployment.

## Reference

This tool implements the visualization concepts described in:

**Mondrian Abstraction and Language Model Embeddings for Differential Pathway Analysis**
*   **Authors**: Fuad Al Abir and Jake Y. Chen
*   **Publication**: IEEE Conference Publication
*   **Link**: [IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/10822686)
