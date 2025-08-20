/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    styledComponents: true
  },
  // Add webpack configuration to handle PDF.js worker
  webpack: (config, { isServer }) => {
    // Only apply this in the browser build
    if (!isServer) {
      // Add a rule to handle PDF.js worker
      config.module.rules.push({
        test: /pdf\.worker\.(min\.)?(js|mjs)$/,
        type: 'asset/resource',
        generator: {
          filename: 'static/chunks/[name][ext]',
        },
      });
    }

    return config;
  }
};
module.exports = nextConfig;
