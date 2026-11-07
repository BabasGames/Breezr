// pm2 config for the live-link server. Everything lives in this folder (~/breezr-live on the server),
// logs included, instead of ~/.pm2/logs.
const { join } = require('path');

module.exports = {
  apps: [{
    name: 'breezr-live',
    script: 'server.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '63120', DATA_DIR: './data', PUBLIC_DIR: './public' },
    out_file: join(__dirname, 'logs', 'out.log'),
    error_file: join(__dirname, 'logs', 'error.log'),
    merge_logs: true,
    time: true,
    max_memory_restart: '200M',
  }],
};
