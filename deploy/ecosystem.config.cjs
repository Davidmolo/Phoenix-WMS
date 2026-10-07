// Phoenix WMS — PM2 process file
// Ports chosen to avoid existing services:
//   3000 retention | 3010 trailhead-web | 3020 fuel-optimizer-web
//   4000 fuel-staging | 4010 trailhead-api | 5000 fuel-optimizer-api
// Phoenix: web 3030 · api 4020

module.exports = {
  apps: [
    {
      name: "phoenix-wms-api",
      cwd: "/var/www/phoenix-wms/backend",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "4020",
      },
      max_memory_restart: "400M",
      time: true,
      error_file: "/var/www/phoenix-wms/logs/api-error.log",
      out_file: "/var/www/phoenix-wms/logs/api-out.log",
      merge_logs: true,
    },
    {
      name: "phoenix-wms-web",
      cwd: "/var/www/phoenix-wms/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3030 -H 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3030",
        HOSTNAME: "127.0.0.1",
        API_PROXY_ORIGIN: "http://127.0.0.1:4020",
      },
      max_memory_restart: "512M",
      time: true,
      error_file: "/var/www/phoenix-wms/logs/web-error.log",
      out_file: "/var/www/phoenix-wms/logs/web-out.log",
      merge_logs: true,
    },
  ],
};
