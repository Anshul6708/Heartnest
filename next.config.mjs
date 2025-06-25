/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            allowedOrigins: [
                'localhost:3000',
                'wavelength-d3.vercel.app',
                'your-new-app-name.vercel.app'  // Replace with your actual domain
            ]
        }
    }
};

export default nextConfig; 