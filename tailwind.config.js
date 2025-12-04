/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                mondrian: {
                    red: '#E30022',
                    blue: '#0078BF',
                    yellow: '#FFD700',
                    gray: '#F0F0F0',
                    black: '#1D1D1D',
                }
            }
        },
    },
    plugins: [],
}
