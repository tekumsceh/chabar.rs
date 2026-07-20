/**
 * PM2 process file for Hostinger VPS.
 * Start:  pm2 start deploy/ecosystem.config.cjs
 * Reload: pm2 reload ioorganize
 */
module.exports = {
  apps: [
    {
      name: "ioorganize",
      script: "server/index.js",
      cwd: "/var/www/ioorganize",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      // Keep logs under the app folder
      error_file: "/var/www/ioorganize/logs/error.log",
      out_file: "/var/www/ioorganize/logs/out.log",
      merge_logs: true,
      time: true,
      max_memory_restart: "400M",
    },
  ],
};
