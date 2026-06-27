/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // node:sqlite هو موديول مدمج في Node.js 22+ — لا حاجة لإعداد خاص
};
module.exports = nextConfig;
