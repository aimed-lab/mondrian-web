/**
 * Convert an SVG string to a PNG Blob.
 * 
 * @param {string} svgString - The raw SVG XML string.
 * @param {number} originalWidth - Original width of the SVG viewport.
 * @param {number} originalHeight - Original height of the SVG viewport.
 * @returns {Promise<Blob>} A promise that resolves to a high-resolution PNG Blob.
 */
export const svgToPngBlob = (svgString, originalWidth = 1000, originalHeight = 1000) => {
    return new Promise((resolve, reject) => {
        // Use a 4x scale factor for "shiny publication-ready" high resolution
        const scaleFactor = 4;
        const width = originalWidth * scaleFactor;
        const height = originalHeight * scaleFactor;

        // Replace the width and height attributes in the SVG string to ensure the browser
        // rasterizes it natively at the high-res dimensions, preventing blurry upscaling.
        const scaledSvgString = svgString
            .replace(/width="[^"]+"/, `width="${width}"`)
            .replace(/height="[^"]+"/, `height="${height}"`);

        const img = new Image();
        const svgUrl = URL.createObjectURL(new Blob([scaledSvgString], { type: "image/svg+xml;charset=utf-8" }));

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            // For a truly crisp background, ensure image smoothing properties are enabled
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.fillStyle = "#F3F4F6"; // background color (matches bg-gray-100)
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            URL.revokeObjectURL(svgUrl);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to convert canvas to blob"));
            }, "image/png", 1.0);
        };
        img.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            reject(new Error("Failed to load SVG into image"));
        };
        img.src = svgUrl;
    });
};

/**
 * Convert a Blob to a Base64 string.
 * 
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
